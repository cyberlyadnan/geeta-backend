import { GstSupplyType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';
import { financeSettingsService } from './finance-settings.service.js';
import { gstService, stateCodeFromGstin } from './gst.service.js';
import { stateCodeFromName } from './india-states.js';

/** The slice of an invoice the tax-line builder reads. Declared explicitly rather than inferred
 *  from a Prisma payload type so the builder stays testable with a plain object. */
interface TaxableInvoiceShape {
  dispatchBatch: {
    orders: {
      order: {
        id: string;
        items: {
          quantity: number;
          totalPrice: Prisma.Decimal;
          productOfferingVersion: { productOffering: { name: string; hsnCode: string | null } } | null;
        }[];
      };
    }[];
  };
}

/**
 * Derives the GST detail an issued invoice needs but the dispatch module never captured: the place
 * of supply, the CGST/SGST vs IGST split, the GSTR-1 table it belongs to, and the HSN-wise tax
 * lines.
 *
 * Why this is derived rather than captured at billing time: the dispatch flow is already live and
 * correct about *amounts*, and rewriting it to also compute tax detail would put a
 * revenue-critical path at risk for a reporting requirement. Deriving keeps the existing flow
 * untouched, works on invoices raised before this system existed, and can be re-run safely if the
 * company's state code or a product's HSN is corrected later.
 *
 * It is idempotent: `taxDetailReady` guards the work, and `force` re-derives after a correction.
 */
export class InvoiceTaxService {
  async ensureTaxDetail(invoiceId: string, options: { force?: boolean } = {}) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        dispatchBatch: {
          include: {
            vendor: { select: { vendorProfile: { select: { gstNumber: true, state: true } } } },
            retailCustomer: { select: { name: true } },
            orders: {
              include: {
                order: {
                  select: {
                    id: true,
                    orderNumber: true,
                    subtotal: true,
                    items: {
                      select: {
                        id: true,
                        quantity: true,
                        totalPrice: true,
                        productSnapshot: true,
                        productOfferingVersion: {
                          select: {
                            productOffering: { select: { name: true, hsnCode: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) return null;
    if (invoice.taxDetailReady && !options.force) return invoice;

    const settings = await financeSettingsService.get();
    const vendorProfile = invoice.dispatchBatch.vendor?.vendorProfile;

    // Place of supply, best source first: the buyer's GSTIN prefix, then their recorded state,
    // then the company's own state (an unregistered walk-in is a local supply by definition).
    const placeOfSupply =
      stateCodeFromGstin(invoice.gstNumber) ??
      stateCodeFromGstin(vendorProfile?.gstNumber) ??
      stateCodeFromName(vendorProfile?.state) ??
      settings.homeStateCode;

    const supplyType = await gstService.supplyTypeFor(placeOfSupply);

    const subtotal = invoice.subtotal.toNumber();
    const deliveryCharge = invoice.deliveryCharge.toNumber();
    const gstAmount = invoice.gstAmount.toNumber();
    const ratePercent = invoice.gstRate.toNumber() * 100;

    const split = await gstService.split({
      taxableValue: subtotal + deliveryCharge,
      ratePercent,
      placeOfSupplyStateCode: placeOfSupply,
      knownTaxAmount: gstAmount,
    });

    const documentCategory = await gstService.documentCategory({
      buyerGstin: invoice.gstNumber,
      supplyType,
      invoiceTotal: invoice.total.toNumber(),
    });

    const taxLines = this.buildTaxLines({
      invoice: invoice as unknown as TaxableInvoiceShape,
      settings,
      supplyType,
      ratePercent,
      totalTax: gstAmount,
      deliveryCharge,
    });

    return prisma.$transaction(async (tx) => {
      await tx.invoiceTaxLine.deleteMany({ where: { invoiceId: invoice.id } });
      if (taxLines.length > 0) {
        await tx.invoiceTaxLine.createMany({
          data: taxLines.map((line) => ({ ...line, invoiceId: invoice.id })),
        });
      }
      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          placeOfSupply,
          supplyType,
          documentCategory,
          cgstAmount: new Prisma.Decimal(split.cgst),
          sgstAmount: new Prisma.Decimal(split.sgst),
          igstAmount: new Prisma.Decimal(split.igst),
          taxDetailReady: true,
        },
      });
    });
  }

  /**
   * One tax line per HSN code across every item in the batch, plus a line for the delivery charge.
   * Tax is apportioned by taxable value with the remainder on the last line, so the lines always
   * add back to the invoice's own GST amount exactly — a mismatch there is what makes a GSTR-1
   * upload fail validation.
   */
  private buildTaxLines(input: {
    invoice: TaxableInvoiceShape;
    settings: { defaultHsnCode: string };
    supplyType: GstSupplyType;
    ratePercent: number;
    totalTax: number;
    deliveryCharge: number;
  }) {
    const { settings, supplyType, ratePercent, totalTax, deliveryCharge } = input;

    interface Bucket {
      hsnCode: string;
      description: string;
      quantity: number;
      taxableValue: number;
      orderId: string | null;
    }
    const buckets = new Map<string, Bucket>();

    for (const batchOrder of input.invoice.dispatchBatch.orders) {
      for (const item of batchOrder.order.items) {
        const offering = item.productOfferingVersion?.productOffering;
        const hsnCode = offering?.hsnCode?.trim() || settings.defaultHsnCode;
        const key = hsnCode;
        const existing = buckets.get(key);
        const taxableValue = item.totalPrice.toNumber();
        if (existing) {
          existing.quantity += item.quantity;
          existing.taxableValue += taxableValue;
        } else {
          buckets.set(key, {
            hsnCode,
            description: offering?.name ?? 'Printing job',
            quantity: item.quantity,
            taxableValue,
            orderId: batchOrder.order.id,
          });
        }
      }
    }

    if (deliveryCharge > 0) {
      // SAC 9968 — goods transport / courier services.
      buckets.set('9968', {
        hsnCode: '9968',
        description: 'Delivery charges',
        quantity: 1,
        taxableValue: deliveryCharge,
        orderId: null,
      });
    }

    const rows = [...buckets.values()];
    if (rows.length === 0) return [];

    const taxShares = gstService.apportion(totalTax, rows.map((r) => r.taxableValue));
    const isIntra = supplyType === GstSupplyType.INTRA_STATE;

    return rows.map((row, index) => {
      const tax = taxShares[index] ?? 0;
      const cgst = isIntra ? Math.round((tax / 2) * 100) / 100 : 0;
      const sgst = isIntra ? Math.round((tax - cgst) * 100) / 100 : 0;
      const igst = isIntra ? 0 : tax;
      return {
        lineNumber: index + 1,
        description: row.description,
        hsnCode: row.hsnCode,
        uom: 'NOS',
        quantity: new Prisma.Decimal(row.quantity),
        taxableValue: new Prisma.Decimal(row.taxableValue.toFixed(2)),
        gstRate: new Prisma.Decimal(ratePercent.toFixed(2)),
        cgstAmount: new Prisma.Decimal(cgst.toFixed(2)),
        sgstAmount: new Prisma.Decimal(sgst.toFixed(2)),
        igstAmount: new Prisma.Decimal(igst.toFixed(2)),
        cessAmount: new Prisma.Decimal(0),
        total: new Prisma.Decimal((row.taxableValue + tax).toFixed(2)),
        orderId: row.orderId,
      };
    });
  }

  /** Batch helper used by the projection and the backfill script. */
  async ensureManyTaxDetails(invoiceIds: string[], options: { force?: boolean } = {}) {
    let done = 0;
    for (const id of invoiceIds) {
      try {
        await this.ensureTaxDetail(id, options);
        done += 1;
      } catch (error) {
        logger.warn('Could not derive GST detail for invoice', {
          invoiceId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return done;
  }
}

export const invoiceTaxService = new InvoiceTaxService();
