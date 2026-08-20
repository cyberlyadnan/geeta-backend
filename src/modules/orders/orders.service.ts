import {
  ActivityAction,
  DeliveryPreference,
  DeliveryStatus,
  FinancialAuditAction,
  FinancialEventType,
  FinancialReferenceType,
  ProductionOrderStatus,
  WalletTransactionType,
  WorkflowStepType,
  type Prisma,
} from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { resolveRequiredSlotCodes } from '../../services/artwork/required-file-slots.js';
import { toDecimal } from '../../utils/money.js';
import {
  calculateOrderTotals,
  formatVendorAddress,
  resolveDeliveryForOrder,
} from '../../services/delivery/index.js';
import { contextRepository, type VendorCheckoutContext } from '../../repositories/context.repository.js';
import { deliverySettingsRepository } from '../../repositories/delivery-settings.repository.js';
import {
  orderRepository,
  type OrderDetailRecord,
  type OrderListRecord,
} from '../../repositories/order.repository.js';
import { priceResolverService, toFeet } from '../../services/pricing-engine/index.js';
import type { PriceCalculationResult } from '../../services/pricing-engine/index.js';
import { printJobService } from '../print-engine/services/print-job.service.js';
import { printContextResolver } from '../admin-print-master/print-context.resolver.js';
import { walletLedgerService } from '../../services/ledger/wallet-ledger.service.js';
import { activityLogService } from '../../services/activity/activity-log.service.js';
import { allocateOrderNumber } from './order-number.service.js';
import { notifyUser, recordOrderEvent } from './order-events.service.js';
import { workflowEngine } from '../workflow/workflow.engine.js';
import {
  findMissingRequiredFields,
  resolveOrderQuestions,
  type OrderConfigRule,
} from '../admin-products/order-configuration.evaluator.js';
import { designApprovalService } from '../design-approval/design-approval.service.js';
import { storageService } from '../../services/storage/storage.service.js';
import { isPreviewableArtwork } from '../../services/storage/storage.utils.js';
import type { CreateProductionOrderInput, ListOrdersQuery, OrderPreviewInput } from './orders.validation.js';
import { ARTWORK_EMAIL_SERVICE_CHARGE } from './orders.constants.js';

const ESTIMATED_DAYS_DEFAULT = 3;

function buildOrderPricingInputContext(
  input: CreateProductionOrderInput | OrderPreviewInput,
  resolved: NonNullable<Awaited<ReturnType<typeof printContextResolver.resolveForVersion>>>,
) {
  const size = input.size
    ? {
        sizeCode: input.size.sizeCode,
        width: input.size.width,
        height: input.size.height,
        unit: input.size.unit,
      }
    : undefined;

  const runtimeValues: Record<string, unknown> = {};
  if (input.coverageResults?.length) {
    runtimeValues['coverageResults'] = input.coverageResults;
  }

  return {
    selectedSize: size,
    printProcess: resolved.context.printProcess?.code ?? null,
    lamination: input.selections['lamination'] ?? null,
    uv: input.selections['uv'] ?? null,
    foil: input.selections['foil'] ?? null,
    embossing: input.selections['embossing'] ?? null,
    eyelets: input.selections['eyelets'] ?? null,
    dispatchOption:
      input.orderDeliveryChoice == null
        ? null
        : input.orderDeliveryChoice
          ? 'DELIVERY'
          : 'SELF_PICKUP',
    runtimeValues,
  };
}

/**
 * Who the order is being placed for. Vendor self-serve and admin-created-for-vendor both use
 * the 'vendor' shape (identical pricing/wallet path); admin-created-for-walk-in uses 'retail'
 * (same pipeline, no wallet — see phase1-order-flexibility-as-built.md).
 */
export type OrderActor =
  | { type: 'vendor'; vendorUserId: string }
  | { type: 'retail'; retailCustomerId: string };

interface OrderCheckoutContext {
  settings: VendorCheckoutContext['settings'];
  vendor: { deliveryPreference: DeliveryPreference };
  vendorDefaultAddress: string | null;
}

async function resolveCheckoutContext(actor: OrderActor): Promise<OrderCheckoutContext> {
  if (actor.type === 'vendor') {
    const ctx = await contextRepository.getVendorCheckoutContext(actor.vendorUserId);
    return {
      settings: ctx.settings,
      vendor: ctx.vendor,
      vendorDefaultAddress: formatVendorAddress(ctx.vendor),
    };
  }

  // Retail customers have no VendorProfile to read a delivery preference from — default to
  // "ask per order" so admin picks delivery vs. counter pickup at order-entry time, and no
  // stored default address (Phase 1 RetailCustomer has no address field).
  const settings = await deliverySettingsRepository.getOrCreate();
  return {
    settings,
    vendor: { deliveryPreference: DeliveryPreference.ASK_ON_EVERY_ORDER },
    vendorDefaultAddress: null,
  };
}

export class OrdersService {
  async findAll(userId: string, query: ListOrdersQuery) {
    const { page, limit, search, status, fromDate, toDate } = query;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * safeLimit;

    const [orders, total] = await orderRepository.findManyByCustomer(userId, skip, safeLimit, {
      search,
      status: status as ProductionOrderStatus | undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });

    return {
      items: orders.map(mapOrderToListDto),
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 1 },
    };
  }

  async countByStatus(userId: string) {
    const groups = await orderRepository.countByStatus(userId);
    const counts: Record<string, number> = {};
    let total = 0;
    for (const g of groups) {
      counts[g.status] = g._count.status;
      total += g._count.status;
    }
    return { counts, total };
  }

  async findById(userId: string, id: string) {
    const order = await orderRepository.findByIdForCustomer(userId, id);
    if (!order) throw ApiError.notFound('Order not found');
    return await mapOrderToDetailDto(order);
  }

  async preview(actor: OrderActor, input: OrderPreviewInput) {
    const computed = await this.computeOrderTotals(actor, input, { forPreview: true });

    if (actor.type === 'retail') {
      // No wallet for retail customers in Phase 1 — payment/credit is Phase 2 scope.
      return { ...computed, wallet: null };
    }

    const wallet = await walletLedgerService.getWalletSummary(actor.vendorUserId);
    const balance = wallet.balance;
    const shortage = Math.max(0, computed.totals.grandTotal - balance);

    return {
      ...computed,
      wallet: { balance, shortage, canAfford: shortage === 0 },
    };
  }

  /**
   * @param createdByActorId Staff user id when placed on behalf of the actor (admin-created
   *   order) — null for vendor self-serve.
   */
  async create(actor: OrderActor, input: CreateProductionOrderInput, createdByActorId: string | null = null) {
    if (actor.type === 'retail' && !createdByActorId) {
      throw ApiError.internal('Retail-customer orders must record which staff member created them');
    }

    const computed = await this.computeOrderTotals(actor, input);

    // Retail-customer orders have no wallet in Phase 1 — nothing to check or debit (Phase 2
    // scope). Vendor orders (self-serve or admin-created-for-vendor) keep the existing
    // balance-sufficiency gate unchanged.
    let walletBalanceBefore = 0;
    if (actor.type === 'vendor') {
      const wallet = await walletLedgerService.getWalletSummary(actor.vendorUserId);
      walletBalanceBefore = wallet.balance;
      if (wallet.balance < computed.totals.grandTotal) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          'Insufficient wallet balance',
          true,
          undefined,
          'INSUFFICIENT_WALLET',
          {
            shortage: computed.totals.grandTotal - wallet.balance,
            required: computed.totals.grandTotal,
            balance: wallet.balance,
          },
        );
      }
    }

    const notesParts = [
      input.specialRemark?.trim(),
      input.pressline?.trim() ? `Pressline: ${input.pressline.trim()}` : null,
      input.fileOption ? `File option: ${input.fileOption}` : null,
    ].filter(Boolean);

    const estimatedCompletionAt = new Date();
    estimatedCompletionAt.setDate(estimatedCompletionAt.getDate() + ESTIMATED_DAYS_DEFAULT);

    // Who performed the action: the staff member for admin-created orders, the vendor
    // themselves for self-serve, undefined for a retail walk-in order nobody "is".
    const eventActorId = createdByActorId ?? (actor.type === 'vendor' ? actor.vendorUserId : undefined);

    const orderResult = await prisma.$transaction(
      async (tx) => {
      const orderNumber = await allocateOrderNumber(tx, actor.type === 'retail' ? 'RC' : 'GP');

      const snapshot = await tx.priceSnapshot.create({
        data: {
          subtotal: toDecimal(computed.priceResult.subtotal),
          adjustmentTotal: toDecimal(
            computed.priceResult.adjustmentTotal +
              (computed.livePricing?.adjustments.coverage ?? 0) +
              (computed.livePricing?.adjustments.size ?? 0),
          ),
          discountTotal: toDecimal(computed.priceResult.discountTotal),
          taxTotal: toDecimal(computed.totals.taxAmount),
          grandTotal: toDecimal(computed.productTotal),
          calculation: {
            ...(computed.priceResult.snapshotPayload as object),
            sizeAdjustment: computed.livePricing?.adjustments.size ?? 0,
            coverageAdjustment: computed.livePricing?.adjustments.coverage ?? 0,
            coverageBreakdown: computed.livePricing?.adjustments.coverageBreakdown ?? [],
            delivery: computed.resolution,
            artworkEmailCharge: computed.totals.artworkEmailCharge,
            walletBalanceBefore,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const initialStatusInTx =
        input.artworks?.length && input.fileOption !== 'email'
          ? ProductionOrderStatus.UNDER_ARTWORK_REVIEW
          : ProductionOrderStatus.ORDER_PLACED;

      const created = await tx.productionOrder.create({
        data: {
          orderNumber,
          customerId: actor.type === 'vendor' ? actor.vendorUserId : null,
          retailCustomerId: actor.type === 'retail' ? actor.retailCustomerId : null,
          createdByActorId,
          orderName: input.orderName.trim(),
          status: initialStatusInTx,
          subtotal: computed.totals.productTotal,
          deliveryCharge: computed.totals.deliveryCharge,
          taxAmount: computed.totals.taxAmount,
          totalAmount: computed.totals.grandTotal,
          deliveryRequired: computed.resolution.deliveryRequired,
          deliveryType: computed.resolution.deliveryType,
          deliveryAddress: computed.resolution.deliveryAddress,
          deliveryStatus: computed.resolution.deliveryRequired ? DeliveryStatus.PENDING : null,
          notes: notesParts.length > 0 ? notesParts.join('\n') : null,
          walletDeducted: actor.type === 'vendor',
          estimatedCompletionAt,
          sourceDraftId: input.draftId ?? null,
          items: {
            create: {
              productOfferingVersionId: computed.versionId,
              quantity: input.quantity,
              unitPrice: computed.priceResult.unitPrice,
              totalPrice: computed.productTotal,
              priceSnapshotId: snapshot.id,
              productSnapshot: computed.productSnapshot as Prisma.InputJsonValue,
              configurationSnapshot: computed.configurationSnapshot as Prisma.InputJsonValue,
              sizeSnapshot: computed.sizeSnapshot as Prisma.InputJsonValue,
              validationSnapshot: computed.validationSnapshot as Prisma.InputJsonValue,
              coverageSnapshot: computed.coverageSnapshot as Prisma.InputJsonValue,
              configurations: { create: computed.configEntries },
            },
          },
        },
        include: { items: true },
      });

      const orderItem = created.items[0];
      if (!orderItem) throw ApiError.internal('Order item creation failed');

      await Promise.all(
        (input.artworks ?? []).map(async (artwork) => {
          const reqMeta = computed.fileRequirements.find((r) => r.code === artwork.requirementCode);

          const orderArtwork = await tx.orderArtwork.create({
            data: {
              orderItemId: orderItem.id,
              artworkFileId: artwork.artworkFileId,
              fileRequirementCode: artwork.requirementCode,
              printLayerCode: reqMeta?.code,
            },
          });

          await tx.orderArtworkVersion.create({
            data: {
              orderArtworkId: orderArtwork.id,
              artworkVersionId: artwork.artworkVersionId,
            },
          });
        }),
      );

      const artworkVersionIds = (input.artworks ?? []).map((a) => a.artworkVersionId);
      const artworkVersions =
        artworkVersionIds.length > 0
          ? await tx.artworkVersion.findMany({
              where: { id: { in: artworkVersionIds } },
              select: { id: true, fileAssetId: true },
            })
          : [];
      const fileAssetByVersionId = new Map(artworkVersions.map((av) => [av.id, av.fileAssetId]));

      await Promise.all(
        (input.artworks ?? []).map((artwork) => {
          const reqMeta = computed.fileRequirements.find((r) => r.code === artwork.requirementCode);
          const fileAssetId = fileAssetByVersionId.get(artwork.artworkVersionId);
          if (!fileAssetId) return Promise.resolve();
          return tx.orderItemFile.create({
            data: {
              orderItemId: orderItem.id,
              fileRequirementCode: artwork.requirementCode,
              fileRequirementLabel: reqMeta?.label ?? artwork.requirementCode,
              fileAssetId,
            },
          });
        }),
      );

      if (actor.type === 'vendor') {
        await walletLedgerService.debitWallet(
          {
            userId: actor.vendorUserId,
            amount: computed.totals.grandTotal,
            type: WalletTransactionType.ORDER_PAYMENT,
            productionOrderId: created.id,
            remarks: `Order ${orderNumber}`,
            auditAction: FinancialAuditAction.WALLET_DEBIT,
            auditActorId: eventActorId ?? actor.vendorUserId,
            referenceNumber: `ORD-${orderNumber}`,
            financialEvent: {
              eventType: FinancialEventType.ORDER_PLACEMENT_DEBIT,
              referenceType: FinancialReferenceType.ORDER,
              referenceId: created.id,
              createdByUserId: eventActorId ?? actor.vendorUserId,
            },
          },
          tx,
        );
      }

      await recordOrderEvent(
        created.id,
        {
          eventType: 'ORDER_CREATED',
          title: 'Order placed',
          description:
            createdByActorId
              ? `Order ${orderNumber} created by staff on behalf of the ${actor.type === 'vendor' ? 'vendor' : 'customer'}`
              : `Order ${orderNumber} created successfully`,
          actorId: eventActorId,
          metadata: { orderNumber, total: computed.totals.grandTotal },
        },
        tx,
      );

      if (input.artworks?.length) {
        await recordOrderEvent(
          created.id,
          {
            eventType: 'ARTWORK_UPLOADED',
            title: 'Artwork submitted',
            description: `${input.artworks.length} file(s) attached for production review`,
            actorId: eventActorId,
          },
          tx,
        );
      }

      if (actor.type === 'vendor') {
        await recordOrderEvent(
          created.id,
          {
            eventType: 'WALLET_CHARGED',
            title: 'Wallet charged',
            description: `₹${computed.totals.grandTotal.toFixed(2)} deducted from wallet`,
            actorId: eventActorId,
            metadata: { amount: computed.totals.grandTotal },
          },
          tx,
        );
      }

      if (input.draftId && actor.type === 'vendor') {
        await tx.vendorOrderDraft.deleteMany({ where: { id: input.draftId, userId: actor.vendorUserId } });
      }

      // Phase 4 — whether this order routes through the design team (computed once in
      // computeOrderTotals, as computed.needsDesignTask — see the comment there). The wallet was
      // already debited above: design revisions never re-charge, however many rounds happen.
      const hasArtwork = Boolean(input.artworks?.length);
      if (computed.needsDesignTask) {
        await designApprovalService.createForOrder(
          {
            orderId: created.id,
            matterContent: input.designMatter ?? input.specialRemark ?? null,
            price: input.designPriceOverride ?? computed.defaultDesignPrice?.toNumber() ?? null,
            attachmentFileAssetIds: computed.verifiedDesignAttachmentIds,
          },
          tx,
        );
      }

      const workflowResult = await workflowEngine.createForProductionOrder(
        {
          orderId: created.id,
          productionOrderItemId: orderItem.id,
          productOfferingVersionId: computed.versionId,
          createdById: eventActorId,
          metadata: { orderNumber },
          // Synthetic signal alongside the vendor's real config selections — lets a template's
          // DESIGN/PROOF_APPROVAL steps opt into skipWhen: { field: "_has_artwork", ... } for
          // products where design is conditional. Never set on the wedding-card template, so
          // wedding-card orders always go through Design regardless of this flag.
          orderSelections: { ...input.selections, _has_artwork: hasArtwork ? 'true' : 'false' },
        },
        tx,
      );

      return {
        orderId: created.id,
        orderNumber,
        status: initialStatusInTx,
        createdAt: created.createdAt,
        workflowResult,
      };
      },
      { maxWait: 10_000, timeout: 45_000 },
    );

    workflowEngine.publishCreationEvents(orderResult.workflowResult);

    // Retail walk-in orders have no app user to notify — vendor-created orders (self-serve or
    // admin-on-behalf-of) still get the usual in-app notification.
    if (actor.type === 'vendor') {
      void notifyUser(actor.vendorUserId, {
        type: 'ORDER_CREATED',
        title: 'Order placed successfully',
        body: `Your order ${orderResult.orderNumber} has been placed. Total: ₹${computed.totals.grandTotal.toFixed(2)}`,
        entityType: 'production_order',
        entityId: orderResult.orderId,
      });
    }

    if (eventActorId) {
      activityLogService.logAsync({
        action: ActivityAction.ORDER_CREATED,
        entityType: 'production_order',
        entityId: orderResult.orderId,
        actorId: eventActorId,
        metadata: { orderNumber: orderResult.orderNumber, total: computed.totals.grandTotal },
      });
    }

    if (actor.type === 'vendor' && eventActorId) {
      activityLogService.logAsync({
        action: ActivityAction.ORDER_WALLET_CHARGED,
        entityType: 'production_order',
        entityId: orderResult.orderId,
        actorId: eventActorId,
        metadata: { amount: computed.totals.grandTotal },
      });
    }

    return {
      id: orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      orderName: input.orderName.trim(),
      status: orderResult.status,
      productTotal: computed.totals.productTotal,
      deliveryCharge: computed.totals.deliveryCharge,
      taxAmount: computed.totals.taxAmount,
      totalAmount: computed.totals.grandTotal,
      createdAt: orderResult.createdAt.toISOString(),
      delivery: {
        required: computed.resolution.deliveryRequired,
        type: computed.resolution.deliveryType,
        charge: computed.totals.deliveryCharge,
        address: computed.resolution.deliveryAddress,
        status: computed.resolution.deliveryRequired ? DeliveryStatus.PENDING : null,
      },
      notes: notesParts.length > 0 ? notesParts.join('\n') : null,
      updatedAt: orderResult.createdAt.toISOString(),
    };
  }

  async buildReorderPayload(userId: string, orderId: string) {
    const order = await orderRepository.findByIdForCustomer(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');
    const item = order.items[0];
    if (!item) throw ApiError.badRequest('Order has no items');

    const configSnap = item.configurationSnapshot as Record<string, unknown>;
    const sizeSnap = item.sizeSnapshot as Record<string, unknown> | null;
    const productSnap = item.productSnapshot as { productId?: string };

    return {
      productId: productSnap.productId ?? item.productOfferingVersion.productOffering.id,
      versionId: item.productOfferingVersion.id,
      orderName: `${order.orderName ?? 'Order'} (Reorder)`,
      quantity: item.quantity,
      selections: (configSnap['selections'] as Record<string, string>) ?? {},
      size: sizeSnap ?? undefined,
      configurations: item.configurations,
    };
  }

  /**
   * Server-side mirror of the admin "Required" flag on ConfigurationField (with REQUIRE rules
   * layered on top, same as the vendor wizard evaluates client-side). A field with no default
   * option and isRequired=true stays unfilled until the vendor explicitly picks a value; this is
   * the actual enforcement point — the wizard's red-outline validation is UX only.
   */
  private async assertRequiredSelectionsFilled(versionId: string, selections: Record<string, string>) {
    const fields = await prisma.configurationField.findMany({
      where: { productOfferingVersionId: versionId },
      select: { id: true, code: true, label: true, isRequired: true, isVisible: true },
    });
    if (fields.length === 0) return;

    const ruleRows = await prisma.configurationRule.findMany({
      where: { productOfferingVersionId: versionId },
      orderBy: { sortOrder: 'asc' },
      include: { targetField: { select: { code: true } } },
    });
    const rules: OrderConfigRule[] = ruleRows.map((r) => ({
      id: r.id,
      targetFieldId: r.targetFieldId,
      targetFieldCode: r.targetField.code,
      ruleType: r.ruleType,
      condition: r.condition as Record<string, unknown>,
      sortOrder: r.sortOrder,
    }));

    const resolved = resolveOrderQuestions(fields, rules, selections);
    const missing = findMissingRequiredFields(fields, resolved, selections);
    if (missing.length > 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Please select: ${missing.map((m) => m.label).join(', ')}`,
        true,
        undefined,
        'MISSING_REQUIRED_SELECTIONS',
        { fields: missing },
      );
    }
  }

  private async computeOrderTotals(
    actor: OrderActor,
    input: CreateProductionOrderInput | OrderPreviewInput,
    options: { forPreview?: boolean } = {},
  ) {
    const versionId = input.versionId;
    if (!versionId) throw ApiError.badRequest('Product version is required');

    const [checkout, printContextResolved] = await Promise.all([
      resolveCheckoutContext(actor),
      printContextResolver.resolveForVersion(versionId),
    ]);

    if (!printContextResolved) {
      throw ApiError.notFound('Product version not found');
    }

    // Mirrors the wizard's own required-field check so a stale client or a direct API call can't
    // place an order that skips an attribute the admin marked mandatory (e.g. no default option
    // set). Preview calls are exempt — the vendor is still filling the form at that point.
    if (!options.forPreview) {
      await this.assertRequiredSelectionsFilled(versionId, input.selections);
    }

    const pricingContext = buildOrderPricingInputContext(input, printContextResolved);
    const uploadedDimensions =
      input.size?.width != null && input.size?.height != null
        ? {
            widthFt: toFeet(input.size.width, input.size.unit),
            heightFt: toFeet(input.size.height, input.size.unit),
          }
        : undefined;

    const priceResolution = await priceResolverService.resolvePrice({
      versionId,
      vendorId: actor.type === 'vendor' ? actor.vendorUserId : undefined,
      quantity: input.quantity,
      selections: input.selections,
      uploadedDimensions,
      context: pricingContext,
    });

    if (!priceResolution.valid) {
      throw ApiError.badRequest(priceResolution.reason ?? 'This combination is not available');
    }

    const basePriceComponent =
      priceResolution.lines.find((l) => l.code === 'base')?.amount ?? priceResolution.finalPrice;
    const priceResult: PriceCalculationResult = {
      versionId: priceResolution.versionId,
      quantity: priceResolution.quantity,
      subtotal: basePriceComponent,
      adjustmentTotal: Math.round((priceResolution.finalPrice - basePriceComponent) * 100) / 100,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: priceResolution.finalPrice,
      unitPrice: priceResolution.unitPrice,
      currency: priceResolution.currency,
      lines: priceResolution.lines,
      snapshotPayload: priceResolution.snapshotPayload,
    };

    const livePricing = printJobService.buildLivePricingTotals(
      {
        productId: input.productId,
        versionId,
        quantity: input.quantity,
        selections: input.selections,
        size: input.size
          ? {
              strategyType:
                (printContextResolved.context.sizeStrategy?.strategyType as never) ?? 'CUSTOM_SIZE',
              ...input.size,
            }
          : undefined,
        coverageResults: input.coverageResults,
        orderDeliveryChoice: input.orderDeliveryChoice,
        deliveryAddress: input.deliveryAddress,
      },
      {
        priceResult,
        checkout,
        resolved: printContextResolved,
        skipSizeAdjustment: priceResolution.strategyKey === 'flex_area',
      },
    );

    const printContext = printContextResolved?.context;
    const fileRequirements = printContext?.fileRequirements ?? [];

    // Single source of truth for "does this order route through the design team rather than a
    // vendor-supplied print-ready file" — REQUIRED products always do, OPTIONAL products do when
    // the vendor asked for help, and staff can force it either way (true or false) for a
    // local/counter order regardless of the product's own mode. Used both to decide whether
    // artwork is required below and, in create(), whether to open a DesignTask — one decision,
    // computed once, so the two can never disagree.
    const designServiceMode = printContextResolved.version.productTypeProfile?.designServiceMode ?? 'NOT_OFFERED';
    const vendorWantsDesignHelp =
      designServiceMode === 'OPTIONAL' && 'needsDesignHelp' in input && Boolean(input.needsDesignHelp);
    const staffDesignOverride = 'designRequired' in input ? input.designRequired : undefined;
    const needsDesignTask =
      staffDesignOverride ?? (designServiceMode === 'REQUIRED' || vendorWantsDesignHelp);

    // Which slots this configuration actually asks for — both-sides printing adds a back file, a
    // UV option adds its own, all from admin configuration. Enforced here and not only in the
    // wizard: the browser decides what to show, the server decides what is acceptable, so a stale
    // client or a direct API call cannot place an order missing artwork production needs.
    if (!options.forPreview && input.fileOption !== 'email' && !needsDesignTask) {
      const requiredCodes = resolveRequiredSlotCodes(fileRequirements, input.selections);
      const supplied = new Set((input.artworks ?? []).map((a) => a.requirementCode));
      const missing = requiredCodes.filter((code) => !supplied.has(code));
      if (missing.length > 0) {
        const labels = missing.map(
          (code) => fileRequirements.find((r) => r.code === code)?.label ?? code,
        );
        throw ApiError.badRequest(`Artwork is still missing for: ${labels.join(', ')}`);
      }
    }

    const productTotal = livePricing?.productTotal ?? priceResult.grandTotal;

    const resolution = resolveDeliveryForOrder(checkout.settings, {
      vendorPreference: checkout.vendor.deliveryPreference,
      orderDeliveryChoice: input.orderDeliveryChoice,
      deliveryAddress: input.deliveryAddress,
      vendorDefaultAddress: checkout.vendorDefaultAddress,
    });

    if (
      !options.forPreview &&
      resolution.deliveryRequired &&
      !resolution.deliveryAddress
    ) {
      throw ApiError.badRequest('Delivery address is required for delivery orders');
    }

    const artworkEmailCharge =
      input.fileOption === 'email' ? ARTWORK_EMAIL_SERVICE_CHARGE : 0;

    const totals = calculateOrderTotals({
      productTotal,
      deliveryResolution: resolution,
      artworkEmailCharge,
    });

    const configEntries = Object.entries(input.selections).map(([fieldCode, selectedValue]) => {
      const field = priceResult.lines.find((l) => l.code === fieldCode);
      const value = String(selectedValue);
      return {
        fieldCode,
        fieldLabel: field?.label ?? fieldCode,
        selectedValue: value,
        selectedLabel: value,
      };
    });

    if (input.size) {
      const sizeLabel = input.size.sizeCode
        ? input.size.sizeCode
        : `${input.size.width ?? ''}×${input.size.height ?? ''} ${input.size.unit ?? 'MM'}`;
      configEntries.push({
        fieldCode: '__size',
        fieldLabel: 'Size',
        selectedValue: sizeLabel,
        selectedLabel: sizeLabel,
      });
    }

    let validationSnapshot: Record<string, unknown> | null = null;
    let coverageSnapshot: Record<string, unknown> | null = null;

    if (input.artworks?.length) {
      // Artwork ownership is checked against the vendor for vendor orders (self-serve or
      // admin-placed-on-their-behalf — the vendor still owns their own uploads either way).
      // Retail walk-ins have no app account to own an upload against; artwork attachment for
      // retail orders is out of Phase 1's scope (no artwork slots in the admin-order UI yet).
      if (actor.type === 'retail') {
        throw ApiError.badRequest('Artwork attachment is not yet supported for retail-customer orders');
      }
      const validation = await printJobService.validateArtworksForOrder(
        actor.vendorUserId,
        versionId,
        input.artworks,
        printContextResolved,
      );
      validationSnapshot = { items: validation.items, canProceed: validation.canProceed };
    }

    if (input.coverageResults?.length) {
      coverageSnapshot = { results: input.coverageResults };
    }

    let verifiedDesignAttachmentIds: string[] = [];
    const designAttachmentIds = 'designAttachments' in input ? input.designAttachments : undefined;
    if (!options.forPreview && designAttachmentIds?.length) {
      if (actor.type === 'retail') {
        throw ApiError.badRequest('Design attachments are not yet supported for retail-customer orders');
      }
      const owned = await prisma.fileAsset.findMany({
        where: { id: { in: designAttachmentIds }, uploadedById: actor.vendorUserId },
        select: { id: true },
      });
      if (owned.length !== designAttachmentIds.length) {
        throw ApiError.badRequest('One or more design attachments could not be found');
      }
      verifiedDesignAttachmentIds = owned.map((f) => f.id);
    }

    const offering = printContextResolved.version.productOffering;

    return {
      versionId: priceResult.versionId,
      priceResult,
      livePricing,
      productTotal,
      totals,
      resolution,
      configEntries,
      fileRequirements,
      /** Phase 4 — the single decision of whether this order routes through the design team;
       *  see the comment above where it's computed. */
      designServiceMode,
      needsDesignTask,
      verifiedDesignAttachmentIds,
      /** Snapshotted onto DesignTask.price at creation — never re-read from here afterward, so a
       *  later catalog change never alters an already-placed order's design fee. */
      defaultDesignPrice: printContextResolved.version.productTypeProfile?.defaultDesignPrice ?? null,
      productSnapshot: {
        productId: offering.id,
        name: offering.displayName ?? offering.name,
        slug: offering.slug,
        thumbnailUrl: offering.thumbnailUrl,
        printProcess: printContext?.printProcess ?? null,
        capturedAt: new Date().toISOString(),
      },
      configurationSnapshot: {
        selections: input.selections,
        printSpecification: printContext?.printSpecification ?? null,
        capturedAt: new Date().toISOString(),
      },
      sizeSnapshot: input.size
        ? { ...input.size, strategy: printContext?.sizeStrategy?.strategyType ?? null }
        : null,
      validationSnapshot,
      coverageSnapshot,
    };
  }

  async getInvoiceForOrder(userId: string, orderId: string) {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { customerId: true, retailCustomerId: true },
    });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.customerId !== userId) {
      throw ApiError.forbidden('You do not have permission to access this order');
    }

    const batchOrder = await prisma.dispatchBatchOrder.findUnique({
      where: { orderId },
      select: { dispatchBatchId: true },
    });
    if (!batchOrder) {
      throw ApiError.notFound('No invoice generated for this order yet');
    }

    const { dispatchService } = await import('../dispatch/dispatch.service.js');
    return dispatchService.getInvoiceForBatch(batchOrder.dispatchBatchId);
  }
}

async function resolveArtworkPreviewUrl(
  version:
    | { previewUrl: string | null; previewKey: string | null }
    | null
    | undefined,
  fileAsset: {
    fileUrl: string;
    fileKey: string;
    originalName: string;
    extension: string;
    mimeType: string;
  },
): Promise<string | null> {
  const ext = fileAsset.extension.toLowerCase();
  const isRaster =
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) ||
    fileAsset.mimeType.toLowerCase().startsWith('image/');
  const isPdf = ext === 'pdf' || fileAsset.mimeType.toLowerCase() === 'application/pdf';

  async function presignKey(key: string, mimeType?: string): Promise<string | null> {
    if (!key?.trim()) return null;
    try {
      const signed = await storageService.createPresignedDownload(key, {
        fileName: fileAsset.originalName,
        mimeType,
      });
      return signed.url;
    } catch {
      try {
        return storageService.getPublicUrlForKey(key);
      } catch {
        return null;
      }
    }
  }

  // Generated WebP preview (PDF rasterization or optimized thumb)
  if (version?.previewUrl) return version.previewUrl;
  if (version?.previewKey) {
    const fromPreviewKey = await presignKey(version.previewKey, 'image/webp');
    if (fromPreviewKey) return fromPreviewKey;
  }

  // Raster originals — public CDN URL is reliable for <img> (matches print-job status API)
  if (isRaster && fileAsset.fileUrl) return fileAsset.fileUrl;

  if ((isRaster || isPdf) && isPreviewableArtwork(ext)) {
    const fromFileKey = await presignKey(fileAsset.fileKey, fileAsset.mimeType);
    if (fromFileKey) return fromFileKey;
  }

  return null;
}

async function resolveArtworkFileUrl(fileAsset: {
  fileUrl: string;
  fileKey: string;
  originalName: string;
  mimeType: string;
}): Promise<string | null> {
  if (fileAsset.fileUrl) return fileAsset.fileUrl;
  if (!fileAsset.fileKey?.trim()) return null;
  try {
    const signed = await storageService.createPresignedDownload(fileAsset.fileKey, {
      fileName: fileAsset.originalName,
      mimeType: fileAsset.mimeType,
    });
    return signed.url;
  } catch {
    try {
      return storageService.getPublicUrlForKey(fileAsset.fileKey);
    } catch {
      return null;
    }
  }
}

/** Step types that represent real, physical production work happening in a specific department
 *  (as opposed to design/review/QC/dispatch, which already have their own precise order-status
 *  values). Mirrors order-status-sync.service.ts's STEP_TYPE_TO_ORDER_STATUS "IN_PRODUCTION"
 *  bucket exactly, so the department name shown here always agrees with what put the order into
 *  IN_PRODUCTION in the first place. */
const PRODUCTION_STEP_TYPES = new Set<WorkflowStepType>([
  WorkflowStepType.PRINTING,
  WorkflowStepType.LAMINATION,
  WorkflowStepType.UV,
  WorkflowStepType.FOILING,
  WorkflowStepType.DIE_CUTTING,
  WorkflowStepType.PACKAGING,
  WorkflowStepType.CUSTOM,
]);

interface StageTask {
  stepOrder: number;
  department: { name: string } | null;
  workflowStep: { stepType: WorkflowStepType };
}

/**
 * "In Production" is a status bucket, not a department — an order sitting there is actually at
 * Printing, Lamination, Die Cutting, or whichever department currently owns it. This resolves the
 * real department name from the order's active workflow tasks so the vendor sees where their
 * order physically is, not just the generic bucket it's rolled up into.
 *
 * When more than one production-stage task is active (rare, but possible with multi-item orders),
 * the one with the highest stepOrder wins — that's the furthest-progressed, i.e. current, step.
 */
function deriveCurrentStageLabel(workflowInstances: { tasks: StageTask[] }[]): string | null {
  let best: { stepOrder: number; label: string } | null = null;
  for (const instance of workflowInstances) {
    for (const task of instance.tasks) {
      if (!PRODUCTION_STEP_TYPES.has(task.workflowStep.stepType)) continue;
      if (!task.department?.name) continue;
      if (!best || task.stepOrder > best.stepOrder) {
        best = { stepOrder: task.stepOrder, label: task.department.name };
      }
    }
  }
  return best?.label ?? null;
}

function mapOrderToListDto(order: OrderListRecord) {
  const item = order.items[0];
  // Rolled-up artwork state for the list row's badge. "needs_revision" wins over "rejected"
  // because it is the actionable one — the vendor needs to upload a new file. Nothing set means
  // no artwork attached (email-flow order or wizard-in-progress).
  const artworkStatuses = item?.orderArtworks.map((a) => a.approvalStatus) ?? [];
  const artworkState: 'needs_revision' | 'rejected' | 'approved' | 'pending' | 'none' =
    artworkStatuses.length === 0
      ? 'none'
      : artworkStatuses.includes('REVISION_REQUESTED')
        ? 'needs_revision'
        : artworkStatuses.includes('REJECTED')
          ? 'rejected'
          : artworkStatuses.every((s) => s === 'APPROVED')
            ? 'approved'
            : 'pending';
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
    currentStageLabel: deriveCurrentStageLabel(order.workflowInstances),
    artworkState,
    productName:
      item?.productOfferingVersion.productOffering.displayName ??
      item?.productOfferingVersion.productOffering.name,
    thumbnailUrl: item?.productOfferingVersion.productOffering.thumbnailUrl ?? null,
    quantity: item?.quantity ?? 0,
    productTotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    deliveryRequired: order.deliveryRequired,
    deliveryType: order.deliveryType,
    deliveryStatus: order.deliveryStatus,
    estimatedCompletionAt: order.estimatedCompletionAt,
    createdAt: order.createdAt,
  };
}

async function mapOrderToDetailDto(order: OrderDetailRecord) {
  const item = order.items[0];
  const walletTx = order.walletTransactions[0];

  const artworks = item
    ? await Promise.all(
        item.orderArtworks.map(async (a) => ({
          id: a.id,
          artworkVersionId: a.pinnedVersion?.artworkVersion.id ?? null,
          requirementCode: a.fileRequirementCode,
          approvalStatus: a.approvalStatus,
          // The verifier's note is what a vendor needs to see when a revision is requested — the
          // approval status alone tells them something is wrong without saying what.
          verifierNote: a.adminNotes ?? null,
          approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
          verifier: a.approvedBy
            ? {
                name: `${a.approvedBy.firstName} ${a.approvedBy.lastName}`.trim(),
                phone: a.approvedBy.phone ?? null,
              }
            : null,
          fileName: a.artworkFile.fileAsset.originalName,
          extension: a.artworkFile.fileAsset.extension,
          previewUrl: await resolveArtworkPreviewUrl(
            a.pinnedVersion?.artworkVersion,
            a.artworkFile.fileAsset,
          ),
          fileUrl: await resolveArtworkFileUrl(a.artworkFile.fileAsset),
          validation: a.pinnedVersion?.artworkVersion.validation ?? null,
          coverage: a.pinnedVersion?.artworkVersion.coverageAnalyses ?? [],
          metadata: a.pinnedVersion?.artworkVersion.metadata ?? null,
        })),
      )
    : [];

  const batchOrder = await prisma.dispatchBatchOrder.findUnique({
    where: { orderId: order.id },
    select: { dispatchBatch: { select: { invoice: { select: { id: true, pdfUrl: true } } } } }
  });
  const hasInvoice = !!batchOrder?.dispatchBatch.invoice;
  const invoicePdfUrl = batchOrder?.dispatchBatch.invoice?.pdfUrl ?? null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
    currentStageLabel: deriveCurrentStageLabel(order.workflowInstances),
    hasInvoice,
    invoicePdfUrl,
    productTotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    walletDeducted: order.walletDeducted,
    estimatedCompletionAt: order.estimatedCompletionAt,
    delivery: {
      required: order.deliveryRequired,
      type: order.deliveryType,
      charge: Number(order.deliveryCharge),
      address: order.deliveryAddress,
      status: order.deliveryStatus,
    },
    notes: order.notes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    pricingSnapshot: item?.priceSnapshot
      ? {
          subtotal: Number(item.priceSnapshot.subtotal),
          adjustments: Number(item.priceSnapshot.adjustmentTotal),
          tax: Number(item.priceSnapshot.taxTotal),
          grandTotal: Number(item.priceSnapshot.grandTotal),
          calculation: item.priceSnapshot.calculation,
        }
      : null,
    walletTransaction: walletTx
      ? {
          amount: Number(walletTx.amount),
          balanceBefore: Number(walletTx.balanceBefore),
          balanceAfter: Number(walletTx.balanceAfter),
          referenceNumber: walletTx.referenceNumber,
          createdAt: walletTx.createdAt,
        }
      : null,
    timeline: order.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
    item: item
      ? {
          id: item.id,
          productId: item.productOfferingVersion.productOffering.id,
          productName:
            item.productOfferingVersion.productOffering.displayName ??
            item.productOfferingVersion.productOffering.name,
          thumbnailUrl: item.productOfferingVersion.productOffering.thumbnailUrl ?? null,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          configurations: item.configurations.map((c) => ({
            fieldCode: c.fieldCode,
            fieldLabel: c.fieldLabel,
            selectedLabel: c.selectedLabel,
          })),
          snapshots: {
            product: item.productSnapshot,
            configuration: item.configurationSnapshot,
            size: item.sizeSnapshot,
            validation: item.validationSnapshot,
            coverage: item.coverageSnapshot,
          },
          artworks,
        }
      : null,
  };
}

export const ordersService = new OrdersService();
