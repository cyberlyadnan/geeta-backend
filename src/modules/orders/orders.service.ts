import {
  ActivityAction,
  DeliveryStatus,
  FinancialAuditAction,
  ProductionOrderStatus,
  WalletTransactionType,
  type Prisma,
} from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal } from '../../utils/money.js';
import {
  calculateOrderTotals,
  formatVendorAddress,
  resolveDeliveryForOrder,
} from '../../services/delivery/index.js';
import { contextRepository } from '../../repositories/context.repository.js';
import {
  orderRepository,
  type OrderDetailRecord,
  type OrderListRecord,
} from '../../repositories/order.repository.js';
import { productsService } from '../products/products.service.js';
import { printJobService } from '../print-engine/services/print-job.service.js';
import { printContextResolver } from '../admin-print-master/print-context.resolver.js';
import { walletLedgerService } from '../../services/ledger/wallet-ledger.service.js';
import { activityLogService } from '../../services/activity/activity-log.service.js';
import { allocateOrderNumber } from './order-number.service.js';
import { notifyUser, recordOrderEvent } from './order-events.service.js';
import { workflowEngine } from '../workflow/workflow.engine.js';
import { storageService } from '../../services/storage/storage.service.js';
import { isPreviewableArtwork } from '../../services/storage/storage.utils.js';
import type { CreateProductionOrderInput, ListOrdersQuery, OrderPreviewInput } from './orders.validation.js';
import { ARTWORK_EMAIL_SERVICE_CHARGE } from './orders.constants.js';

const ESTIMATED_DAYS_DEFAULT = 3;

export class OrdersService {
  async findAll(userId: string, query: ListOrdersQuery) {
    const { page, limit, search, status, fromDate, toDate } = query;
    const safeLimit = Math.min(Math.max(limit, 1), 50);
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

  async findById(userId: string, id: string) {
    const order = await orderRepository.findByIdForCustomer(userId, id);
    if (!order) throw ApiError.notFound('Order not found');
    return await mapOrderToDetailDto(order);
  }

  async preview(userId: string, input: OrderPreviewInput) {
    const computed = await this.computeOrderTotals(userId, input, { forPreview: true });
    const wallet = await walletLedgerService.getWalletSummary(userId);
    const balance = wallet.balance;
    const shortage = Math.max(0, computed.totals.grandTotal - balance);

    return {
      ...computed,
      wallet: { balance, shortage, canAfford: shortage === 0 },
    };
  }

  async create(userId: string, input: CreateProductionOrderInput) {
    const [computed, wallet] = await Promise.all([
      this.computeOrderTotals(userId, input),
      walletLedgerService.getWalletSummary(userId),
    ]);

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

    const notesParts = [
      input.specialRemark?.trim(),
      input.pressline?.trim() ? `Pressline: ${input.pressline.trim()}` : null,
      input.fileOption ? `File option: ${input.fileOption}` : null,
    ].filter(Boolean);

    const estimatedCompletionAt = new Date();
    estimatedCompletionAt.setDate(estimatedCompletionAt.getDate() + ESTIMATED_DAYS_DEFAULT);

    const orderResult = await prisma.$transaction(
      async (tx) => {
      const orderNumber = await allocateOrderNumber(tx);

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
            walletBalanceBefore: wallet.balance,
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
          customerId: userId,
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
          walletDeducted: true,
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

      await walletLedgerService.debitWallet(
        {
          userId,
          amount: computed.totals.grandTotal,
          type: WalletTransactionType.ORDER_PAYMENT,
          productionOrderId: created.id,
          remarks: `Order ${orderNumber}`,
          auditAction: FinancialAuditAction.WALLET_DEBIT,
          auditActorId: userId,
          referenceNumber: `ORD-${orderNumber}`,
        },
        tx,
      );

      await recordOrderEvent(
        created.id,
        {
          eventType: 'ORDER_CREATED',
          title: 'Order placed',
          description: `Order ${orderNumber} created successfully`,
          actorId: userId,
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
            actorId: userId,
          },
          tx,
        );
      }

      await recordOrderEvent(
        created.id,
        {
          eventType: 'WALLET_CHARGED',
          title: 'Wallet charged',
          description: `₹${computed.totals.grandTotal.toFixed(2)} deducted from wallet`,
          actorId: userId,
          metadata: { amount: computed.totals.grandTotal },
        },
        tx,
      );

      if (input.draftId) {
        await tx.vendorOrderDraft.deleteMany({ where: { id: input.draftId, userId } });
      }

      const workflowResult = await workflowEngine.createForProductionOrder(
        {
          orderId: created.id,
          productionOrderItemId: orderItem.id,
          productOfferingVersionId: computed.versionId,
          createdById: userId,
          metadata: { orderNumber },
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

    void notifyUser(userId, {
      type: 'ORDER_CREATED',
      title: 'Order placed successfully',
      body: `Your order ${orderResult.orderNumber} has been placed. Total: ₹${computed.totals.grandTotal.toFixed(2)}`,
      entityType: 'production_order',
      entityId: orderResult.orderId,
    });

    activityLogService.logAsync({
      action: ActivityAction.ORDER_CREATED,
      entityType: 'production_order',
      entityId: orderResult.orderId,
      actorId: userId,
      metadata: { orderNumber: orderResult.orderNumber, total: computed.totals.grandTotal },
    });

    activityLogService.logAsync({
      action: ActivityAction.ORDER_WALLET_CHARGED,
      entityType: 'production_order',
      entityId: orderResult.orderId,
      actorId: userId,
      metadata: { amount: computed.totals.grandTotal },
    });

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

  private async computeOrderTotals(
    userId: string,
    input: CreateProductionOrderInput | OrderPreviewInput,
    options: { forPreview?: boolean } = {},
  ) {
    const versionId = input.versionId;
    if (!versionId) throw ApiError.badRequest('Product version is required');

    const [checkout, priceResult, printContextResolved] = await Promise.all([
      contextRepository.getVendorCheckoutContext(userId),
      productsService.calculatePrice({
        productId: input.productId,
        versionId,
        quantity: input.quantity,
        selections: input.selections,
      }),
      printContextResolver.resolveForVersion(versionId),
    ]);

    if (!printContextResolved) {
      throw ApiError.notFound('Product version not found');
    }

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
      { priceResult, checkout, resolved: printContextResolved },
    );

    const printContext = printContextResolved?.context;
    const fileRequirements = printContext?.fileRequirements ?? [];

    const productTotal = livePricing?.productTotal ?? priceResult.grandTotal;

    const resolution = resolveDeliveryForOrder(checkout.settings, {
      vendorPreference: checkout.vendor.deliveryPreference,
      orderDeliveryChoice: input.orderDeliveryChoice,
      deliveryAddress: input.deliveryAddress,
      vendorDefaultAddress: formatVendorAddress(checkout.vendor),
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
      const validation = await printJobService.validateArtworksForOrder(
        userId,
        versionId,
        input.artworks,
        printContextResolved,
      );
      validationSnapshot = { items: validation.items, canProceed: validation.canProceed };
    }

    if (input.coverageResults?.length) {
      coverageSnapshot = { results: input.coverageResults };
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

function mapOrderToListDto(order: OrderListRecord) {
  const item = order.items[0];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
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

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
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
