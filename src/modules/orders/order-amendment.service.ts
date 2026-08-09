import {
  DeliveryPreference,
  DeliveryType,
  FinancialAuditAction,
  FinancialEventType,
  FinancialReferenceType,
  WalletTransactionType,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import { calculateOrderTotals } from '../../services/delivery/index.js';
import { priceResolverService, toFeet } from '../../services/pricing-engine/index.js';
import { printContextResolver } from '../admin-print-master/print-context.resolver.js';
import { walletLedgerService } from '../../services/ledger/wallet-ledger.service.js';
import { recordOrderEvent } from './order-events.service.js';
import { checkOrderAmendable } from './order-amendment-gate.js';
import type { RequestAmendmentInput } from './order-amendment.validation.js';

const AMENDMENT_TX_OPTIONS = { maxWait: 10_000, timeout: 45_000 } as const;

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type OrderAmendmentDb = Pick<typeof prisma, 'productionOrder' | '$transaction'>;

export class OrderAmendmentService {
  constructor(private readonly db: OrderAmendmentDb = prisma) {}

  private async loadOrderForAmendment(orderId: string) {
    const order = await this.db.productionOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          take: 1,
          include: { priceSnapshot: true },
        },
        workflowInstances: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            tasks: {
              select: {
                status: true,
                workflowStep: { select: { locksAmendmentsOnStart: true, stepName: true } },
              },
            },
          },
        },
      },
    });

    if (!order) throw ApiError.notFound('Order not found');
    const item = order.items[0];
    if (!item) throw ApiError.badRequest('Order has no items');
    if (!item.priceSnapshot || !item.priceSnapshotId) {
      throw ApiError.internal('Order item has no price snapshot to amend from');
    }

    return { order, item, priceSnapshot: item.priceSnapshot };
  }

  /**
   * Everything an amendment needs to know before anything is written: the gate check, the
   * re-priced totals, and the delta.
   *
   * Extracted so the staff-facing preview and the actual commit run the *same* computation — a
   * preview that disagreed with what gets charged would be worse than no preview at all.
   */
  private async computeAmendment(orderId: string, input: RequestAmendmentInput) {
    const { order, item, priceSnapshot } = await this.loadOrderForAmendment(orderId);

    const workflowInstance = order.workflowInstances[0];
    const gate = checkOrderAmendable({
      orderStatus: order.status,
      workflowTasks: workflowInstance?.tasks ?? [],
    });
    if (!gate.amendable) {
      throw ApiError.badRequest(gate.reason ?? 'This order can no longer be amended');
    }

    const printContextResolved = await printContextResolver.resolveForVersion(
      item.productOfferingVersionId,
    );
    if (!printContextResolved) throw ApiError.notFound('Product version not found');

    const newSelections = input.newConfig.selections;
    const newQuantity = input.newConfig.quantity ?? item.quantity;

    const sizeSnap = item.sizeSnapshot as
      | { width?: number; height?: number; unit?: 'MM' | 'CM' | 'INCH' | 'FT'; sizeCode?: string }
      | null;
    const uploadedDimensions =
      sizeSnap?.width != null && sizeSnap?.height != null
        ? {
            widthFt: toFeet(sizeSnap.width, sizeSnap.unit),
            heightFt: toFeet(sizeSnap.height, sizeSnap.unit),
          }
        : undefined;

    const dispatchOption = order.deliveryRequired ? 'DELIVERY' : order.deliveryType ? 'SELF_PICKUP' : null;

    const priceResolution = await priceResolverService.resolvePrice({
      versionId: item.productOfferingVersionId,
      vendorId: order.customerId ?? undefined,
      quantity: newQuantity,
      selections: newSelections,
      uploadedDimensions,
      context: {
        selectedSize: sizeSnap ?? undefined,
        printProcess: printContextResolved.context.printProcess?.code ?? null,
        lamination: newSelections['lamination'] ?? null,
        uv: newSelections['uv'] ?? null,
        foil: newSelections['foil'] ?? null,
        embossing: newSelections['embossing'] ?? null,
        eyelets: newSelections['eyelets'] ?? null,
        dispatchOption,
        runtimeValues: {},
      },
    });

    if (!priceResolution.valid) {
      throw ApiError.badRequest(priceResolution.reason ?? 'This combination is not available');
    }

    const previousCalculation = priceSnapshot.calculation as Record<string, unknown> | null;
    const artworkEmailCharge = Number(previousCalculation?.['artworkEmailCharge'] ?? 0);

    const totals = calculateOrderTotals({
      productTotal: priceResolution.finalPrice,
      artworkEmailCharge,
      deliveryResolution: {
        deliveryRequired: order.deliveryRequired,
        deliveryType: order.deliveryType ?? DeliveryType.SELF_PICKUP,
        // Replays whatever this order actually stored. Orders placed before Phase 3 carry a
        // non-zero order-time delivery charge; keeping it here is what makes the amendment
        // delta correct for them. Orders placed since carry 0 and are billed at dispatch.
        deliveryCharge: decimalToNumber(order.deliveryCharge),
        indicativeDeliveryCharge: decimalToNumber(order.deliveryCharge),
        deliveryAddress: order.deliveryAddress,
        canToggleDelivery: false,
        askOnOrder: false,
        preferenceApplied: DeliveryPreference.ASK_ON_EVERY_ORDER,
      },
    });

    const basePriceComponent =
      priceResolution.lines.find((l) => l.code === 'base')?.amount ?? priceResolution.finalPrice;

    // Full tax-inclusive order-total delta — the amount that actually needs to move for the
    // wallet, order.totalAmount, and GST to stay consistent. The plan doc's pseudocode diffs raw
    // (pre-tax) snapshot totals, which would silently under/over-collect GST on the change — see
    // "Decisions that diverged from the plan" in the as-built doc.
    const priceDelta =
      Math.round((totals.grandTotal - decimalToNumber(order.totalAmount)) * 100) / 100;

    return {
      order, item, priceSnapshot, priceResolution, totals, priceDelta,
      basePriceComponent, newSelections, newQuantity, artworkEmailCharge,
    };
  }

  /**
   * What the amendment screen needs to render its form: the order's current configuration, the
   * fields that can be changed, and whether amending is still allowed at all.
   */
  async getAmendmentContext(orderId: string) {
    const { order, item } = await this.loadOrderForAmendment(orderId);
    const gate = checkOrderAmendable({
      orderStatus: order.status,
      workflowTasks: order.workflowInstances[0]?.tasks ?? [],
    });

    const configSnapshot = item.configurationSnapshot as { selections?: Record<string, string> } | null;

    const fieldRows = await prisma.configurationField.findMany({
      where: { productOfferingVersionId: item.productOfferingVersionId },
      orderBy: { sortOrder: 'asc' },
      select: {
        code: true,
        label: true,
        options: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { value: true, label: true },
        },
      },
    });

    const fields = fieldRows.map((f) => ({
      code: f.code,
      label: f.label,
      options: f.options.map((o) => ({ value: o.value, label: o.label })),
    }));

    return {
      orderId,
      orderNumber: order.orderNumber,
      amendable: gate.amendable,
      reason: gate.reason ?? null,
      currentQuantity: item.quantity,
      currentSelections: configSnapshot?.selections ?? {},
      currentTotal: decimalToNumber(order.totalAmount),
      fields,
    };
  }

  /** Re-price without writing anything — what the staff amendment screen shows before confirming. */
  async previewAmendment(orderId: string, input: RequestAmendmentInput) {
    const c = await this.computeAmendment(orderId, input);
    return {
      orderId,
      currentTotal: decimalToNumber(c.order.totalAmount),
      newTotal: c.totals.grandTotal,
      priceDelta: c.priceDelta,
      /** DEBIT = customer pays more, CREDIT = refunded, NONE = no money moves. */
      settlement: c.priceDelta > 0 ? 'DEBIT' : c.priceDelta < 0 ? 'CREDIT' : 'NONE',
      totals: c.totals,
      unitPrice: c.priceResolution.unitPrice,
      quantity: c.newQuantity,
      selections: c.newSelections,
    };
  }

  async requestAmendment(orderId: string, staffUserId: string, input: RequestAmendmentInput) {
    const {
      order, item, priceResolution, totals, priceDelta,
      basePriceComponent, newSelections, newQuantity, artworkEmailCharge,
    } = await this.computeAmendment(orderId, input);

    const result = await this.db.$transaction(async (tx) => {
      // Never touch the original snapshot — a brand new, immutable row.
      const newSnapshot = await tx.priceSnapshot.create({
        data: {
          subtotal: toDecimal(basePriceComponent),
          adjustmentTotal: toDecimal(
            Math.round((priceResolution.finalPrice - basePriceComponent) * 100) / 100,
          ),
          discountTotal: toDecimal(0),
          taxTotal: toDecimal(totals.taxAmount),
          grandTotal: toDecimal(totals.productTotal),
          calculation: {
            ...(priceResolution.snapshotPayload as object),
            artworkEmailCharge,
            delivery: {
              deliveryRequired: order.deliveryRequired,
              deliveryType: order.deliveryType,
              deliveryCharge: decimalToNumber(order.deliveryCharge),
            },
            amendedFromSnapshotId: item.priceSnapshotId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const amendment = await tx.orderAmendment.create({
        data: {
          orderId,
          amendedByUserId: staffUserId,
          reason: input.reason,
          previousConfig: item.configurationSnapshot as Prisma.InputJsonValue,
          newConfig: { selections: newSelections, quantity: newQuantity } as Prisma.InputJsonValue,
          previousSnapshotId: item.priceSnapshotId!,
          newSnapshotId: newSnapshot.id,
          priceDelta: toDecimal(priceDelta),
        },
      });

      await tx.productionOrderItem.update({
        where: { id: item.id },
        data: {
          quantity: newQuantity,
          unitPrice: toDecimal(priceResolution.unitPrice),
          totalPrice: toDecimal(totals.productTotal),
          priceSnapshotId: newSnapshot.id,
          configurationSnapshot: {
            ...(item.configurationSnapshot as object),
            selections: newSelections,
            amendedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      await tx.productionOrder.update({
        where: { id: orderId },
        data: {
          subtotal: toDecimal(totals.productTotal),
          taxAmount: toDecimal(totals.taxAmount),
          totalAmount: toDecimal(totals.grandTotal),
        },
      });

      // Retail-customer orders have no wallet — nothing to settle. Full Udhar/credit handling
      // for retail customers is deferred to Phase 2's financial ledger (confirmed scope).
      if (order.customerId && priceDelta !== 0) {
        const referenceNumber = `AMD-${amendment.id}`;
        if (priceDelta > 0) {
          await walletLedgerService.debitWallet(
            {
              userId: order.customerId,
              amount: priceDelta,
              type: WalletTransactionType.ADJUSTMENT,
              productionOrderId: orderId,
              remarks: `Amendment on order ${order.orderNumber}`,
              auditAction: FinancialAuditAction.WALLET_DEBIT,
              auditActorId: staffUserId,
              referenceNumber,
              financialEvent: {
                eventType: FinancialEventType.AMENDMENT_DEBIT,
                referenceType: FinancialReferenceType.AMENDMENT,
                referenceId: amendment.id,
                createdByUserId: staffUserId,
              },
            },
            tx,
          );
        } else {
          await walletLedgerService.creditWallet(
            {
              userId: order.customerId,
              amount: -priceDelta,
              type: WalletTransactionType.ADJUSTMENT,
              productionOrderId: orderId,
              remarks: `Amendment on order ${order.orderNumber}`,
              auditAction: FinancialAuditAction.WALLET_CREDIT,
              auditActorId: staffUserId,
              referenceNumber,
              financialEvent: {
                eventType: FinancialEventType.AMENDMENT_CREDIT,
                referenceType: FinancialReferenceType.AMENDMENT,
                referenceId: amendment.id,
                createdByUserId: staffUserId,
              },
            },
            tx,
          );
        }
      }

      await recordOrderEvent(
        orderId,
        {
          eventType: 'ORDER_AMENDED',
          title: 'Order amended',
          description: input.reason?.trim() || 'Configuration updated by staff',
          actorId: staffUserId,
          metadata: {
            amendmentId: amendment.id,
            priceDelta,
            previousConfig: item.configurationSnapshot,
            newConfig: { selections: newSelections, quantity: newQuantity },
          },
        },
        tx,
      );

      return { amendment, newSnapshot };
    }, AMENDMENT_TX_OPTIONS);

    return {
      amendmentId: result.amendment.id,
      orderId,
      previousSnapshotId: result.amendment.previousSnapshotId,
      newSnapshotId: result.newSnapshot.id,
      priceDelta,
      totals,
    };
  }

  /**
   * The customer's own view of what staff changed on their order.
   *
   * Scoped by `customerId` rather than by role: a vendor may only ever see amendments on an
   * order that is theirs, and an order that isn't theirs is reported as not found rather than
   * as forbidden so this can't be used to probe for other customers' order ids.
   */
  async listAmendmentsForCustomer(customerId: string, orderId: string) {
    const order = await prisma.productionOrder.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    });
    if (!order) throw ApiError.notFound('Order not found');
    return await this.readAmendments(orderId);
  }

  async listAmendments(orderId: string) {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw ApiError.notFound('Order not found');
    return await this.readAmendments(orderId);
  }

  private async readAmendments(orderId: string) {
    const rows = await prisma.orderAmendment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: {
        amendedBy: { select: { id: true, firstName: true, lastName: true } },
        previousSnapshot: { select: { grandTotal: true } },
        newSnapshot: { select: { grandTotal: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      previousConfig: r.previousConfig,
      newConfig: r.newConfig,
      priceDelta: decimalToNumber(r.priceDelta),
      previousSnapshotTotal: decimalToNumber(r.previousSnapshot.grandTotal),
      newSnapshotTotal: decimalToNumber(r.newSnapshot.grandTotal),
      amendedBy: {
        id: r.amendedBy.id,
        name: `${r.amendedBy.firstName} ${r.amendedBy.lastName}`.trim(),
      },
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

export const orderAmendmentService = new OrderAmendmentService();
