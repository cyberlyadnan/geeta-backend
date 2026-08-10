import {
  FinancialActorType,
  FinancialEventType,
  FinancialReferenceType,
  Prisma,
  WalletTransactionType,
  FinancialAuditAction,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import { DEFAULT_GST_RATE } from '../../services/delivery/delivery.types.js';
import { walletLedgerService } from '../../services/ledger/index.js';
import { notifyUser, recordOrderEvent } from '../orders/order-events.service.js';
import { allocateInvoiceNumber } from './invoice-number.service.js';
import { buildInvoicePdf, type InvoicePayload } from './invoice-pdf.service.js';
import { storageService } from '../../services/storage/storage.service.js';
import { STORAGE_FOLDERS } from '../../services/storage/storage.types.js';
import { logger } from '../../logs/logger.js';

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type DispatchDb = Pick<
  typeof prisma,
  'dispatchBatch' | 'deliveryShift' | 'invoice' | '$transaction'
>;

const BATCH_DETAIL_INCLUDE = {
  shift: true,
  vendor: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      vendorProfile: { select: { businessName: true, gstNumber: true } },
    },
  },
  retailCustomer: { select: { id: true, name: true, hasGst: true, gstNumber: true } },
  invoice: true,
  orders: {
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          orderName: true,
          subtotal: true,
          totalAmount: true,
          items: {
            select: {
              quantity: true,
              productSnapshot: true,
              configurationSnapshot: true,
              sizeSnapshot: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DispatchBatchInclude;

type BatchWithDetail = Prisma.DispatchBatchGetPayload<{ include: typeof BATCH_DETAIL_INCLUDE }>;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Resolves the billed party from whichever side of the batch's vendor/retail XOR is populated. */
function resolveActor(batch: BatchWithDetail) {
  if (batch.vendor) {
    return {
      actorType: FinancialActorType.VENDOR,
      actorId: batch.vendor.id,
      name: batch.vendor.vendorProfile?.businessName ?? `${batch.vendor.firstName} ${batch.vendor.lastName}`,
      gstNumber: batch.vendor.vendorProfile?.gstNumber ?? null,
      /** Only vendors have wallets — retail batches are billed but never auto-debited. */
      walletUserId: batch.vendor.id as string | null,
    };
  }
  if (batch.retailCustomer) {
    return {
      actorType: FinancialActorType.RETAIL_CUSTOMER,
      actorId: batch.retailCustomer.id,
      name: batch.retailCustomer.name,
      gstNumber: batch.retailCustomer.hasGst ? batch.retailCustomer.gstNumber : null,
      walletUserId: null,
    };
  }
  throw ApiError.internal('Dispatch batch has neither a vendor nor a retail customer');
}

export class DispatchService {
  constructor(private readonly db: DispatchDb = prisma) {}

  async listShifts(includeInactive = false) {
    const shifts = await this.db.deliveryShift.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { cutoffTime: 'asc' }],
    });
    return shifts.map((shift) => ({
      id: shift.id,
      label: shift.label,
      cutoffTime: shift.cutoffTime,
      sortOrder: shift.sortOrder,
      isActive: shift.isActive,
    }));
  }

  async createShift(input: { label: string; cutoffTime: string; sortOrder?: number }) {
    const shift = await this.db.deliveryShift.create({
      data: {
        label: input.label,
        cutoffTime: input.cutoffTime,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return { id: shift.id, label: shift.label, cutoffTime: shift.cutoffTime, isActive: shift.isActive };
  }

  async updateShift(id: string, input: { label?: string; cutoffTime?: string; sortOrder?: number; isActive?: boolean }) {
    const existing = await this.db.deliveryShift.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Delivery shift not found');
    const shift = await this.db.deliveryShift.update({ where: { id }, data: input });
    return { id: shift.id, label: shift.label, cutoffTime: shift.cutoffTime, isActive: shift.isActive };
  }

  /** The dispatcher's working view. */
  async listBatches(query: { shiftId?: string; status?: string; dispatchDate?: string; page: number; limit: number }) {
    const { page, limit } = query;
    const where: Prisma.DispatchBatchWhereInput = {
      ...(query.shiftId && { shiftId: query.shiftId }),
      ...(query.status && { status: query.status as BatchWithDetail['status'] }),
      ...(query.dispatchDate && { dispatchDate: query.dispatchDate }),
    };

    const [batches, total] = await Promise.all([
      this.db.dispatchBatch.findMany({
        where,
        include: BATCH_DETAIL_INCLUDE,
        orderBy: [{ dispatchDate: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.dispatchBatch.count({ where }),
    ]);

    return {
      items: batches.map((batch) => this.mapBatch(batch)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getBatch(id: string) {
    const batch = await this.db.dispatchBatch.findUnique({ where: { id }, include: BATCH_DETAIL_INCLUDE });
    if (!batch) throw ApiError.notFound('Dispatch batch not found');
    return this.mapBatch(batch);
  }

  /**
   * Flow 2 — the dispatcher prices and bills a batch.
   *
   * Only the delivery charge (plus GST on it) is debited here: every order in the batch was
   * already paid for at placement, so re-charging the order value would double-bill. The
   * invoice still lists each order, so the document reconciles to what the vendor actually paid
   * across both moments.
   *
   * On insufficient wallet balance the batch is held with the charge retained, so a later
   * top-up can release it without the dispatcher re-entering anything.
   */
  async setDeliveryCharge(batchId: string, amount: number, dispatcherUserId: string) {
    if (amount < 0) throw ApiError.badRequest('Delivery charge cannot be negative');

    const result = await this.db.$transaction(async (tx) => {
      const batch = await tx.dispatchBatch.findUnique({
        where: { id: batchId },
        include: BATCH_DETAIL_INCLUDE,
      });
      if (!batch) throw ApiError.notFound('Dispatch batch not found');
      if (batch.status === 'READY' || batch.status === 'DISPATCHED') {
        throw ApiError.badRequest('This batch has already been billed');
      }
      if (batch.orders.length === 0) {
        throw ApiError.badRequest('Cannot bill an empty batch');
      }

      const actor = resolveActor(batch);
      const gstRate = DEFAULT_GST_RATE;

      // What the wallet is actually charged now: delivery + GST on delivery only.
      const deliveryGst = roundMoney(amount * gstRate);
      const amountDueNow = roundMoney(amount + deliveryGst);

      if (actor.walletUserId && amountDueNow > 0) {
        const wallet = await walletLedgerService.ensureWallet(actor.walletUserId, tx);
        const balance = decimalToNumber(wallet.currentBalance);

        if (balance < amountDueNow) {
          const shortfall = roundMoney(amountDueNow - balance);
          const held = await tx.dispatchBatch.update({
            where: { id: batch.id },
            data: {
              status: 'HELD_INSUFFICIENT_BALANCE',
              deliveryCharge: toDecimal(amount),
              heldShortfall: toDecimal(shortfall),
              heldAt: new Date(),
            },
          });

          await notifyUser(
            actor.walletUserId,
            {
              type: 'DISPATCH_BATCH_HELD',
              title: 'Order pending — wallet top-up needed',
              body: `Add Rs. ${shortfall.toFixed(2)} to your wallet to release your ${batch.shift.label} dispatch.`,
              entityType: 'DISPATCH_BATCH',
              entityId: batch.id,
              metadata: { shortfall, deliveryCharge: amount, amountDueNow },
            },
            tx,
          );

          return { held: true as const, shortfall, batch: held, amountDueNow };
        }

        await walletLedgerService.debitWallet(
          {
            userId: actor.walletUserId,
            amount: amountDueNow,
            type: WalletTransactionType.DEBIT,
            remarks: `Delivery charge — ${batch.shift.label} dispatch`,
            createdById: dispatcherUserId,
            auditAction: FinancialAuditAction.WALLET_DEBIT,
            auditActorId: dispatcherUserId,
            financialEvent: {
              eventType: FinancialEventType.DELIVERY_CHARGE_DEBIT,
              referenceType: FinancialReferenceType.DISPATCH_BATCH,
              referenceId: batch.id,
              createdByUserId: dispatcherUserId,
            },
          },
          tx,
        );
      }

      const invoice = await this.createInvoice(tx, batch, actor, amount, gstRate);

      const billed = await tx.dispatchBatch.update({
        where: { id: batch.id },
        data: {
          status: 'READY',
          deliveryCharge: toDecimal(amount),
          heldShortfall: null,
          heldAt: null,
          billedAt: new Date(),
        },
      });

      return { held: false as const, batch: billed, invoice, amountDueNow };
    });

    // The PDF is rendered and uploaded after the transaction commits — holding a database
    // transaction open across object-storage I/O would pin a connection for the length of a
    // network round trip. The invoice row (number, amounts) is the authoritative record; the
    // PDF is a rendering of it and can be regenerated on demand if this step fails.
    if (!result.held && result.invoice) {
      await this.attachInvoicePdf(result.invoice.id).catch((error: unknown) => {
        logger.error('Invoice PDF generation failed; invoice row is intact and can be re-rendered', {
          invoiceId: result.invoice.id,
          error,
        });
      });
    }

    return result.held
      ? {
          status: 'HELD_INSUFFICIENT_BALANCE' as const,
          shortfall: result.shortfall,
          amountDue: result.amountDueNow,
          message: `Insufficient wallet balance — Rs. ${result.shortfall.toFixed(2)} short. The batch is held and will bill automatically once the wallet is topped up.`,
        }
      : {
          status: 'READY' as const,
          amountCharged: result.amountDueNow,
          invoiceId: result.invoice!.id,
          invoiceNumber: result.invoice!.invoiceNumber,
        };
  }

  /**
   * Flow 3 — a wallet top-up releases any batches held for that actor. Called from the wallet
   * credit path; failures here must never fail the top-up itself, so the caller swallows errors.
   */
  async releaseHeldBatchesForVendor(vendorUserId: string, actingUserId: string) {
    const held = await this.db.dispatchBatch.findMany({
      where: { vendorId: vendorUserId, status: 'HELD_INSUFFICIENT_BALANCE' },
      orderBy: { heldAt: 'asc' },
      select: { id: true, deliveryCharge: true },
    });

    const released: string[] = [];
    for (const batch of held) {
      if (batch.deliveryCharge === null) continue;
      // Sequential, oldest first: each retry re-reads the balance, so a top-up that only covers
      // some of the held batches releases them in the order they were held rather than racing.
      const outcome = await this.setDeliveryCharge(
        batch.id,
        decimalToNumber(batch.deliveryCharge),
        actingUserId,
      ).catch((error: unknown) => {
        logger.error('Failed to auto-release held dispatch batch', { batchId: batch.id, error });
        return null;
      });
      if (outcome?.status === 'READY') released.push(batch.id);
    }
    return { releasedBatchIds: released };
  }

  async getInvoiceForBatch(batchId: string) {
    const batch = await this.db.dispatchBatch.findUnique({
      where: { id: batchId },
      include: BATCH_DETAIL_INCLUDE,
    });
    if (!batch) throw ApiError.notFound('Dispatch batch not found');
    if (!batch.invoice) throw ApiError.notFound('This batch has not been billed yet');

    const payload = this.buildInvoicePayload(batch, batch.invoice);
    const bytes = await buildInvoicePdf(payload);
    return {
      invoice: batch.invoice,
      buffer: Buffer.from(bytes),
      filename: `${batch.invoice.invoiceNumber}.pdf`,
    };
  }

  private async createInvoice(
    tx: Prisma.TransactionClient,
    batch: BatchWithDetail,
    actor: ReturnType<typeof resolveActor>,
    deliveryCharge: number,
    gstRate: number,
  ) {
    const subtotal = roundMoney(
      batch.orders.reduce((sum, link) => sum + decimalToNumber(link.order.subtotal), 0),
    );
    const taxableBase = roundMoney(subtotal + deliveryCharge);
    const gstAmount = roundMoney(taxableBase * gstRate);
    const total = roundMoney(taxableBase + gstAmount);

    // Allocated inside this transaction so the number and the row commit or roll back together.
    const invoiceNumber = await allocateInvoiceNumber(tx);

    return tx.invoice.create({
      data: {
        invoiceNumber,
        dispatchBatchId: batch.id,
        actorType: actor.actorType,
        actorId: actor.actorId,
        gstNumber: actor.gstNumber,
        billedToName: actor.name,
        subtotal: toDecimal(subtotal),
        deliveryCharge: toDecimal(deliveryCharge),
        gstRate: toDecimal(gstRate),
        gstAmount: toDecimal(gstAmount),
        total: toDecimal(total),
      },
    });
  }

  private async attachInvoicePdf(invoiceId: string) {
    const invoice = await this.db.invoice.findUnique({
      where: { id: invoiceId },
      include: { dispatchBatch: { include: BATCH_DETAIL_INCLUDE } },
    });
    if (!invoice) return;

    const bytes = await buildInvoicePdf(this.buildInvoicePayload(invoice.dispatchBatch, invoice));
    const upload = await storageService.uploadPdfFromBuffer({
      folder: STORAGE_FOLDERS.INVOICES,
      buffer: Buffer.from(bytes),
      fileName: `${invoice.invoiceNumber}.pdf`,
    });

    await this.db.invoice.update({ where: { id: invoiceId }, data: { pdfUrl: upload.publicUrl } });
  }

  private buildInvoicePayload(
    batch: BatchWithDetail,
    invoice: {
      invoiceNumber: string;
      billedToName: string;
      gstNumber: string | null;
      subtotal: Prisma.Decimal;
      deliveryCharge: Prisma.Decimal;
      gstRate: Prisma.Decimal;
      gstAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      createdAt: Date;
    },
  ): InvoicePayload {
    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt.toISOString().slice(0, 10),
      billedToName: invoice.billedToName,
      gstNumber: invoice.gstNumber,
      shiftLabel: batch.shift.label,
      dispatchDate: batch.dispatchDate,
      lines: batch.orders.map((link) => ({
        orderNumber: link.order.orderNumber,
        description: link.order.orderName ?? 'Print order',
        quantity: link.order.items.reduce((sum, item) => sum + item.quantity, 0),
        amount: decimalToNumber(link.order.subtotal),
      })),
      subtotal: decimalToNumber(invoice.subtotal),
      deliveryCharge: decimalToNumber(invoice.deliveryCharge),
      gstRate: decimalToNumber(invoice.gstRate),
      gstAmount: decimalToNumber(invoice.gstAmount),
      total: decimalToNumber(invoice.total),
    };
  }

  private mapBatch(batch: BatchWithDetail) {
    const actor = resolveActor(batch);
    const ordersSubtotal = roundMoney(
      batch.orders.reduce((sum, link) => sum + decimalToNumber(link.order.subtotal), 0),
    );
    return {
      id: batch.id,
      status: batch.status,
      dispatchDate: batch.dispatchDate,
      shift: { id: batch.shift.id, label: batch.shift.label, cutoffTime: batch.shift.cutoffTime },
      actorType: actor.actorType,
      actorId: actor.actorId,
      actorName: actor.name,
      /** Retail batches are invoiced but never auto-debited — the UI uses this to explain why. */
      billable: actor.walletUserId !== null,
      orderCount: batch.orders.length,
      ordersSubtotal,
      orders: batch.orders.map((link) => {
        const item = link.order.items[0];
        return {
          id: link.order.id,
          orderNumber: link.order.orderNumber,
          orderName: link.order.orderName,
          subtotal: decimalToNumber(link.order.subtotal),
          productName: item ? ((item.productSnapshot as any)?.displayName ?? (item.productSnapshot as any)?.name ?? 'Product') : 'Product',
          quantity: item ? item.quantity : 1,
          configurationSnapshot: item ? item.configurationSnapshot : {},
          sizeSnapshot: item ? item.sizeSnapshot : null,
          productSnapshot: item ? item.productSnapshot : {},
        };
      }),
      deliveryCharge: batch.deliveryCharge === null ? null : decimalToNumber(batch.deliveryCharge),
      heldShortfall: batch.heldShortfall === null ? null : decimalToNumber(batch.heldShortfall),
      heldAt: batch.heldAt?.toISOString() ?? null,
      billedAt: batch.billedAt?.toISOString() ?? null,
      dispatchedAt: batch.dispatchedAt?.toISOString() ?? null,
      invoice: batch.invoice
        ? {
            id: batch.invoice.id,
            invoiceNumber: batch.invoice.invoiceNumber,
            total: decimalToNumber(batch.invoice.total),
            pdfUrl: batch.invoice.pdfUrl,
          }
        : null,
      createdAt: batch.createdAt.toISOString(),
    };
  }

  async markDispatched(batchId: string) {
    const batch = await this.db.dispatchBatch.findUnique({
      where: { id: batchId },
      include: { orders: true },
    });
    if (!batch) throw ApiError.notFound('Dispatch batch not found');
    if (batch.status !== 'READY') {
      throw ApiError.badRequest('Only a billed (READY) batch can be marked dispatched');
    }
    const updated = await this.db.$transaction(async (tx) => {
      const b = await tx.dispatchBatch.update({
        where: { id: batchId },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() },
        include: BATCH_DETAIL_INCLUDE,
      });

      const orderIds = b.orders.map((o) => o.orderId);
      await tx.productionOrder.updateMany({
        where: { id: { in: orderIds } },
        data: { status: 'DISPATCHED', deliveryStatus: 'IN_TRANSIT' },
      });

      for (const orderId of orderIds) {
        await recordOrderEvent(
          orderId,
          {
            eventType: 'ORDER_DISPATCHED',
            title: 'Order Dispatched',
            description: `Order has been dispatched via shift: ${b.shift.label} on date: ${b.dispatchDate}.`,
          },
          tx,
        );
      }

      return b;
    });

    return this.mapBatch(updated);
  }

  async removeOrderFromBatch(batchId: string, orderId: string, dispatcherUserId: string) {
    return this.db.$transaction(async (tx) => {
      const batchOrder = await tx.dispatchBatchOrder.findUnique({
        where: { orderId },
        include: { dispatchBatch: { include: { shift: true } } },
      });
      if (!batchOrder || batchOrder.dispatchBatchId !== batchId) {
        throw ApiError.notFound('Order not found in this batch');
      }
      const batch = batchOrder.dispatchBatch;
      if (batch.status === 'READY' || batch.status === 'DISPATCHED') {
        throw ApiError.badRequest('Cannot defer an order from a batch that has already been billed or dispatched');
      }

      await tx.dispatchBatchOrder.delete({ where: { id: batchOrder.id } });

      const remainingOrdersCount = await tx.dispatchBatchOrder.count({
        where: { dispatchBatchId: batchId },
      });

      if (remainingOrdersCount === 0) {
        await tx.dispatchBatch.delete({ where: { id: batchId } });
      } else if (batch.status === 'HELD_INSUFFICIENT_BALANCE') {
        await tx.dispatchBatch.update({
          where: { id: batchId },
          data: {
            status: 'AWAITING_READY',
            deliveryCharge: null,
            heldShortfall: null,
            heldAt: null,
          },
        });
      }

      const activeShifts = await tx.deliveryShift.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { cutoffTime: 'asc' }],
      });

      const currentSelection = {
        shift: batch.shift,
        dispatchDate: batch.dispatchDate,
        rolledToNextDay: false,
      };

      const { shiftAssignmentService } = await import('./shift-assignment.service.js');
      const nextSelection = shiftAssignmentService.nextShiftAfter(currentSelection, activeShifts);

      const actor = batch.vendorId
        ? { type: 'vendor' as const, vendorId: batch.vendorId }
        : { type: 'retail' as const, retailCustomerId: batch.retailCustomerId! };

      const where =
        actor.type === 'vendor'
          ? {
              vendorId_shiftId_dispatchDate: {
                vendorId: actor.vendorId,
                shiftId: nextSelection.shift.id,
                dispatchDate: nextSelection.dispatchDate,
              },
            }
          : {
              retailCustomerId_shiftId_dispatchDate: {
                retailCustomerId: actor.retailCustomerId,
                shiftId: nextSelection.shift.id,
                dispatchDate: nextSelection.dispatchDate,
              },
            };

      let targetBatch = await tx.dispatchBatch.findUnique({ where });
      let finalSelection = nextSelection;
      if (targetBatch && targetBatch.status !== 'AWAITING_READY') {
        const nextNextSelection = shiftAssignmentService.nextShiftAfter(nextSelection, activeShifts);
        finalSelection = nextNextSelection;
        const whereNext =
          actor.type === 'vendor'
            ? {
                vendorId_shiftId_dispatchDate: {
                  vendorId: actor.vendorId,
                  shiftId: nextNextSelection.shift.id,
                  dispatchDate: nextNextSelection.dispatchDate,
                },
              }
            : {
                retailCustomerId_shiftId_dispatchDate: {
                  retailCustomerId: actor.retailCustomerId,
                  shiftId: nextNextSelection.shift.id,
                  dispatchDate: nextNextSelection.dispatchDate,
                },
              };
        targetBatch = await tx.dispatchBatch.findUnique({ where: whereNext });
        if (!targetBatch) {
          targetBatch = await tx.dispatchBatch.create({
            data: {
              ...(actor.type === 'vendor' ? { vendorId: actor.vendorId } : { retailCustomerId: actor.retailCustomerId }),
              shiftId: nextNextSelection.shift.id,
              dispatchDate: nextNextSelection.dispatchDate,
              status: 'AWAITING_READY',
            },
          });
        }
      } else if (!targetBatch) {
        targetBatch = await tx.dispatchBatch.create({
          data: {
            ...(actor.type === 'vendor' ? { vendorId: actor.vendorId } : { retailCustomerId: actor.retailCustomerId }),
            shiftId: nextSelection.shift.id,
            dispatchDate: nextSelection.dispatchDate,
            status: 'AWAITING_READY',
          },
        });
      }

      await tx.dispatchBatchOrder.create({
        data: {
          dispatchBatchId: targetBatch.id,
          orderId,
        },
      });

      await recordOrderEvent(
        orderId,
        {
          eventType: 'ORDER_DEFERRED_DISPATCH',
          title: 'Dispatch Deferred',
          description: `Order deferred from shift: ${batch.shift.label} (${batch.dispatchDate}) to next shift: ${finalSelection.shift.label} (${targetBatch.dispatchDate}) by dispatcher.`,
          actorId: dispatcherUserId,
        },
        tx,
      );

      return {
        success: true,
        newBatchId: targetBatch.id,
        newDispatchDate: targetBatch.dispatchDate,
        newShiftLabel: finalSelection.shift.label,
      };
    });
  }
}

export const dispatchService = new DispatchService();
