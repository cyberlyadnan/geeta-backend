import {
  DeliveryStatus,
  DeliveryType,
  ProductionOrderStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal } from '../../utils/money.js';
import {
  calculateOrderTotals,
  deliverySettingsRepository,
  formatVendorAddress,
  resolveDeliveryForOrder,
} from '../../services/delivery/index.js';
import { vendorRepository } from '../../repositories/vendor.repository.js';
import { orderRepository } from '../../repositories/order.repository.js';
import { productsService } from '../products/products.service.js';
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
    const [settings, profile, priceResult] = await Promise.all([
      deliverySettingsRepository.getOrCreate(),
      vendorRepository.getForDelivery(userId),
      productsService.calculatePrice({
        productId: input.productId,
        versionId: input.versionId,
        quantity: input.quantity,
        selections: input.selections,
      }),
    ]);

    const productTotal = priceResult.grandTotal;

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
          adjustmentTotal: toDecimal(priceResult.adjustmentTotal),
          discountTotal: toDecimal(priceResult.discountTotal),
          taxTotal: toDecimal(priceResult.taxTotal),
          grandTotal: toDecimal(priceResult.grandTotal),
          calculation: priceResult.snapshotPayload,
        },
      });

      return tx.productionOrder.create({
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
              configurations: {
                create: Object.entries(input.selections).map(([fieldCode, selectedValue]) => {
                  const field = priceResult.lines.find((l) => l.code === fieldCode);
                  return {
                    fieldCode,
                    fieldLabel: field?.label ?? fieldCode,
                    selectedValue,
                    selectedLabel: selectedValue,
                  };
                }),
              },
            },
          },
        },
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
