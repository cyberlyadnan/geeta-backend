import {
  DeliveryStatus,
  DeliveryType,
  ProductionOrderStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal } from '../../utils/money.js';
import {
  calculateOrderTotals,
  formatVendorAddress,
  resolveDeliveryForOrder,
} from '../../services/delivery/index.js';
import { contextRepository } from '../../repositories/context.repository.js';
import { orderRepository } from '../../repositories/order.repository.js';
import { productsService } from '../products/products.service.js';
import { printJobService } from '../print-engine/services/print-job.service.js';
import type { CreateProductionOrderInput } from './orders.validation.js';

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GP-${ts}-${rand}`;
}

export class OrdersService {
  async findAll(userId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (page - 1) * safeLimit;
    const [orders, total] = await orderRepository.findManyByCustomer(userId, skip, safeLimit);

    return {
      items: orders.map(mapOrderToListDto),
      meta: {
        page,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findById(userId: string, id: string) {
    const order = await orderRepository.findByIdForCustomer(userId, id);

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    return mapOrderToDetailDto(order);
  }

  async create(userId: string, input: CreateProductionOrderInput) {
    const versionId = input.versionId;

    if (input.artworks?.length && versionId) {
      const validation = await printJobService.validateArtworksForOrder(
        userId,
        versionId,
        input.artworks,
      );
      if (!validation.canProceed) {
        throw ApiError.badRequest('Artwork validation failed — fix errors before submitting');
      }
    }

    const [checkout, priceResult, livePricing] = await Promise.all([
      contextRepository.getVendorCheckoutContext(userId),
      productsService.calculatePrice({
        productId: input.productId,
        versionId: input.versionId,
        quantity: input.quantity,
        selections: input.selections,
      }),
      versionId
        ? printJobService.calculateLivePricing(userId, {
            productId: input.productId,
            versionId,
            quantity: input.quantity,
            selections: input.selections,
            size: input.size
              ? {
                  strategyType: 'CUSTOM_SIZE',
                  ...input.size,
                }
              : undefined,
          })
        : Promise.resolve(null),
    ]);

    const { settings, vendor: profile } = checkout;

    const productTotal = livePricing?.productTotal ?? priceResult.grandTotal;

    const resolution = resolveDeliveryForOrder(settings, {
      vendorPreference: profile.deliveryPreference,
      orderDeliveryChoice: input.orderDeliveryChoice,
      deliveryAddress: input.deliveryAddress,
      vendorDefaultAddress: formatVendorAddress(profile),
    });

    if (resolution.deliveryRequired && !resolution.deliveryAddress) {
      throw ApiError.badRequest('Delivery address is required for delivery orders');
    }

    const totals = calculateOrderTotals({
      productTotal,
      deliveryResolution: resolution,
    });

    const notesParts = [
      input.specialRemark?.trim(),
      input.pressline?.trim() ? `Pressline: ${input.pressline.trim()}` : null,
      input.fileOption ? `File option: ${input.fileOption}` : null,
    ].filter(Boolean);

    const order = await prisma.$transaction(async (tx) => {
      const snapshot = await tx.priceSnapshot.create({
        data: {
          subtotal: toDecimal(priceResult.subtotal),
          adjustmentTotal: toDecimal(
            priceResult.adjustmentTotal + (livePricing?.adjustments.coverage ?? 0) + (livePricing?.adjustments.size ?? 0),
          ),
          discountTotal: toDecimal(priceResult.discountTotal),
          taxTotal: toDecimal(priceResult.taxTotal),
          grandTotal: toDecimal(productTotal),
          calculation: {
            ...(priceResult.snapshotPayload as object),
            sizeAdjustment: livePricing?.adjustments.size ?? 0,
            coverageAdjustment: livePricing?.adjustments.coverage ?? 0,
            coverageBreakdown: livePricing?.adjustments.coverageBreakdown ?? [],
          } as Prisma.InputJsonValue,
        },
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

      const created = await tx.productionOrder.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: userId,
          orderName: input.orderName.trim(),
          status: ProductionOrderStatus.CONFIRMED,
          subtotal: totals.productTotal,
          deliveryCharge: totals.deliveryCharge,
          taxAmount: totals.taxAmount,
          totalAmount: totals.grandTotal,
          deliveryRequired: resolution.deliveryRequired,
          deliveryType: resolution.deliveryType,
          deliveryAddress: resolution.deliveryAddress,
          deliveryStatus: resolution.deliveryRequired ? DeliveryStatus.PENDING : null,
          notes: notesParts.length > 0 ? notesParts.join('\n') : null,
          items: {
            create: {
              productOfferingVersionId: priceResult.versionId,
              quantity: input.quantity,
              unitPrice: priceResult.unitPrice,
              totalPrice: productTotal,
              priceSnapshotId: snapshot.id,
              configurations: { create: configEntries },
            },
          },
        },
        include: {
          items: true,
        },
      });

      const orderItem = created.items[0];
      if (!orderItem) {
        throw ApiError.internal('Order item creation failed');
      }

      for (const artwork of input.artworks ?? []) {
        const requirement = await tx.fileRequirement.findFirst({
          where: {
            productOfferingVersionId: priceResult.versionId,
            code: artwork.requirementCode,
          },
        });

        const orderArtwork = await tx.orderArtwork.create({
          data: {
            orderItemId: orderItem.id,
            artworkFileId: artwork.artworkFileId,
            fileRequirementCode: artwork.requirementCode,
            printLayerCode: requirement?.code,
          },
        });

        await tx.orderArtworkVersion.create({
          data: {
            orderArtworkId: orderArtwork.id,
            artworkVersionId: artwork.artworkVersionId,
          },
        });

        const av = await tx.artworkVersion.findUnique({
          where: { id: artwork.artworkVersionId },
          select: { fileAssetId: true },
        });

        if (av && requirement) {
          await tx.orderItemFile.create({
            data: {
              orderItemId: orderItem.id,
              fileRequirementCode: requirement.code,
              fileRequirementLabel: requirement.label,
              fileAssetId: av.fileAssetId,
            },
          });
        }
      }

      return tx.productionOrder.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          orderNumber: true,
          orderName: true,
          status: true,
          subtotal: true,
          deliveryCharge: true,
          taxAmount: true,
          totalAmount: true,
          deliveryRequired: true,
          deliveryType: true,
          deliveryAddress: true,
          deliveryStatus: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              configurations: {
                select: { fieldCode: true, fieldLabel: true, selectedLabel: true },
              },
              productOfferingVersion: {
                select: {
                  productOffering: {
                    select: { id: true, name: true, displayName: true, thumbnailUrl: true },
                  },
                },
              },
            },
          },
        },
      });
    });

    if (!order) throw ApiError.internal('Order creation failed');

    return mapOrderToDetailDto(order);
  }
}

function mapOrderToListDto(order: {
  id: string;
  orderNumber: string;
  orderName: string | null;
  status: ProductionOrderStatus;
  subtotal: unknown;
  deliveryCharge: unknown;
  taxAmount: unknown;
  totalAmount: unknown;
  deliveryRequired: boolean;
  deliveryType: DeliveryType | null;
  deliveryStatus: DeliveryStatus | null;
  createdAt: Date;
  items: Array<{
    quantity: number;
    productOfferingVersion: {
      productOffering: { name: string; displayName: string | null };
    };
  }>;
}) {
  const item = order.items[0];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
    productName: item?.productOfferingVersion.productOffering.displayName ?? item?.productOfferingVersion.productOffering.name,
    quantity: item?.quantity ?? 0,
    productTotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    deliveryRequired: order.deliveryRequired,
    deliveryType: order.deliveryType,
    deliveryStatus: order.deliveryStatus,
    createdAt: order.createdAt,
  };
}

function mapOrderToDetailDto(order: {
  id: string;
  orderNumber: string;
  orderName: string | null;
  status: ProductionOrderStatus;
  subtotal: unknown;
  deliveryCharge: unknown;
  taxAmount: unknown;
  totalAmount: unknown;
  deliveryRequired: boolean;
  deliveryType: DeliveryType | null;
  deliveryAddress: string | null;
  deliveryStatus: DeliveryStatus | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: unknown;
    totalPrice: unknown;
    productOfferingVersion: {
      productOffering: { id: string; name: string; displayName: string | null; thumbnailUrl?: string | null };
    };
    configurations: Array<{
      fieldCode: string;
      fieldLabel: string;
      selectedLabel: string;
    }>;
  }>;
}) {
  const item = order.items[0];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderName: order.orderName,
    status: order.status,
    productTotal: Number(order.subtotal),
    deliveryCharge: Number(order.deliveryCharge),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
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
    item: item
      ? {
          id: item.id,
          productId: item.productOfferingVersion.productOffering.id,
          productName: item.productOfferingVersion.productOffering.displayName ?? item.productOfferingVersion.productOffering.name,
          thumbnailUrl: item.productOfferingVersion.productOffering.thumbnailUrl ?? null,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          configurations: item.configurations.map((c) => ({
            fieldCode: c.fieldCode,
            fieldLabel: c.fieldLabel,
            selectedLabel: c.selectedLabel,
          })),
        }
      : null,
  };
}

export const ordersService = new OrdersService();
