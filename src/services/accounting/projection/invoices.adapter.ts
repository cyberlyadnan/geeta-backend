import { GstSupplyType, JournalSourceType, type Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import { invoiceTaxService } from '../invoice-tax.service.js';
import type { PostingLineInput } from '../posting.service.js';
import { emptyOutcome, type EntryPlan, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';

/**
 * The invoice is where a printing job finally becomes revenue.
 *
 * Two entries come out of every invoice, and keeping them separate is deliberate:
 *
 *   1. **SALES_INVOICE** — Dr Accounts Receivable, Cr Printing Sales + Delivery Income + Output
 *      GST. This is the entry the GST return is built from, and it is identical whether or not
 *      the customer had already paid.
 *   2. **ADVANCE_APPLICATION** — Dr Customer Advances, Cr Accounts Receivable, for whatever the
 *      customer had already paid against these orders. What is left in Accounts Receivable
 *      afterwards is exactly what they still owe, which is what makes the ageing report correct.
 *
 * Collapsing the two into one entry would work arithmetically and destroy the ability to answer
 * "what did we bill this month" separately from "what did we collect".
 */

/** Advance already sitting against these orders — wallet/Udhar payments plus counter receipts. */
async function advanceAgainstOrders(orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;

  const [events, receipts] = await Promise.all([
    prisma.financialEvent.groupBy({
      by: ['direction'],
      where: { referenceType: 'ORDER', referenceId: { in: orderIds } },
      _sum: { amount: true },
    }),
    prisma.orderPaymentReceipt.aggregate({
      where: { orderId: { in: orderIds } },
      _sum: { amount: true },
    }),
  ]);

  const debits = toNumber(events.find((e) => e.direction === 'DEBIT')?._sum.amount ?? null);
  const credits = toNumber(events.find((e) => e.direction === 'CREDIT')?._sum.amount ?? null);
  const counter = toNumber(receipts._sum.amount ?? null);

  return Math.max(0, Math.round((debits - credits + counter) * 100) / 100);
}

function revenueLines(input: {
  subtotal: number;
  deliveryCharge: number;
  cgst: number;
  sgst: number;
  igst: number;
  ratePercent: number;
  invoiceId: string;
  invoiceNumber: string;
}): PostingLineInput[] {
  const ref = { referenceType: 'INVOICE', referenceId: input.invoiceId };
  const lines: PostingLineInput[] = [
    {
      accountCode: ACCOUNT_CODES.SALES_PRINTING,
      credit: input.subtotal,
      description: `Printing sales · ${input.invoiceNumber}`,
      taxableValue: input.subtotal,
      taxRate: input.ratePercent,
      ...ref,
    },
  ];

  if (input.deliveryCharge > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.DELIVERY_INCOME,
      credit: input.deliveryCharge,
      description: 'Delivery charges',
      taxableValue: input.deliveryCharge,
      taxRate: input.ratePercent,
      hsnCode: '9968',
      ...ref,
    });
  }
  if (input.cgst > 0) lines.push({ accountCode: ACCOUNT_CODES.OUTPUT_CGST, credit: input.cgst, description: 'Output CGST', ...ref });
  if (input.sgst > 0) lines.push({ accountCode: ACCOUNT_CODES.OUTPUT_SGST, credit: input.sgst, description: 'Output SGST', ...ref });
  if (input.igst > 0) lines.push({ accountCode: ACCOUNT_CODES.OUTPUT_IGST, credit: input.igst, description: 'Output IGST', ...ref });

  return lines;
}

export const invoicesAdapter: ProjectionAdapter = {
  name: 'sales-invoices',
  sourceTypes: [JournalSourceType.SALES_INVOICE, JournalSourceType.ADVANCE_APPLICATION],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('sales-invoices');

    const invoices = await prisma.invoice.findMany({
      where: window.since ? { createdAt: { gte: window.since } } : {},
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: { dispatchBatch: { include: { orders: { select: { orderId: true } } } } },
    });
    outcome.scanned = invoices.length;
    if (invoices.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.SALES_INVOICE, invoices.map((i) => i.id));
    const pending = invoices.filter((i) => !posted.has(i.id));
    outcome.skipped += invoices.length - pending.length;
    if (pending.length === 0) return outcome;

    // Derive the GST split before posting: the entry needs CGST/SGST/IGST as separate lines, and
    // pre-Phase-5 invoices only carry a single blended gstAmount.
    await invoiceTaxService.ensureManyTaxDetails(pending.map((i) => i.id));
    const enriched = await prisma.invoice.findMany({
      where: { id: { in: pending.map((i) => i.id) } },
      include: { dispatchBatch: { include: { orders: { select: { orderId: true } } } } },
    });

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];

    for (const invoice of enriched) {
      const subtotal = toNumber(invoice.subtotal);
      const deliveryCharge = toNumber(invoice.deliveryCharge);
      const total = toNumber(invoice.total);
      const ratePercent = toNumber(invoice.gstRate) * 100;

      // Fall back to a single-state split when the derivation could not run, so the entry still
      // balances and the tax is never silently dropped.
      let cgst = toNumber(invoice.cgstAmount);
      let sgst = toNumber(invoice.sgstAmount);
      let igst = toNumber(invoice.igstAmount);
      if (cgst + sgst + igst === 0) {
        const gst = toNumber(invoice.gstAmount);
        if (invoice.supplyType === GstSupplyType.INTER_STATE) {
          igst = gst;
        } else {
          cgst = Math.round((gst / 2) * 100) / 100;
          sgst = Math.round((gst - cgst) * 100) / 100;
        }
      }

      const party = { partyType: invoice.actorType, partyId: invoice.actorId };
      const orderIds = invoice.dispatchBatch.orders.map((o) => o.orderId);
      const entries: EntryPlan[] = [
        {
          entryDate: invoice.createdAt,
          sourceType: JournalSourceType.SALES_INVOICE,
          sourceId: invoice.id,
          sourceKey: invoice.id,
          narration: `Tax invoice ${invoice.invoiceNumber} to ${invoice.billedToName}`,
          ...party,
          partyName: invoice.billedToName,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            dispatchBatchId: invoice.dispatchBatchId,
            orderIds,
          },
          lines: [
            {
              accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
              debit: total,
              description: `Invoice ${invoice.invoiceNumber}`,
              ...party,
              referenceType: 'INVOICE',
              referenceId: invoice.id,
            },
            ...revenueLines({
              subtotal,
              deliveryCharge,
              cgst,
              sgst,
              igst,
              ratePercent,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            }),
          ],
        },
      ];

      const advance = Math.min(await advanceAgainstOrders(orderIds), total);
      if (advance > 0) {
        entries.push({
          entryDate: invoice.createdAt,
          sourceType: JournalSourceType.ADVANCE_APPLICATION,
          sourceId: invoice.id,
          sourceKey: `${invoice.id}:advance`,
          narration: `Advance applied against invoice ${invoice.invoiceNumber}`,
          ...party,
          partyName: invoice.billedToName,
          metadata: { invoiceNumber: invoice.invoiceNumber, applied: advance },
          lines: [
            {
              accountCode: ACCOUNT_CODES.CUSTOMER_ADVANCES,
              debit: advance,
              description: `Advance applied · ${invoice.invoiceNumber}`,
              ...party,
              referenceType: 'INVOICE',
              referenceId: invoice.id,
            },
            {
              accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
              credit: advance,
              description: `Advance applied · ${invoice.invoiceNumber}`,
              ...party,
              referenceType: 'INVOICE',
              referenceId: invoice.id,
            },
          ],
        });
      }

      plans.push({ sourceId: invoice.id, plans: entries });
    }

    return postPlans(outcome, plans);
  },
};

/** Exported for the reconciliation report, which checks invoice totals against posted revenue. */
export async function invoicedTotalsForRange(from?: Date, to?: Date) {
  const where: Prisma.InvoiceWhereInput =
    from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {};
  const agg = await prisma.invoice.aggregate({
    where,
    _sum: { subtotal: true, deliveryCharge: true, gstAmount: true, total: true },
    _count: { _all: true },
  });
  return {
    count: agg._count._all,
    subtotal: toNumber(agg._sum.subtotal ?? null),
    deliveryCharge: toNumber(agg._sum.deliveryCharge ?? null),
    gstAmount: toNumber(agg._sum.gstAmount ?? null),
    total: toNumber(agg._sum.total ?? null),
  };
}
