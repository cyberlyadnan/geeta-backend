import {
  DeliveryStatus,
  DeliveryType,
  ProductionOrderStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { pricingEngineService } from '../../services/pricing-engine/index.js';
import {
  calculateOrderTotals,
  deliverySettingsRepository,
  formatVendorAddress,
  getVendorProfileForDelivery,
  resolveDeliveryForOrder,
} from '../../services/delivery/index.js';
import { productsService } from '../products/products.service.js';
import type { CreateProductionOrderInput } from './orders.validation.js';

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GP-${ts}-${rand}`;
}

export class OrdersService {
  async findAll(userId: string) {
    const orders = await prisma.productionOrder.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            productOfferingVersion: {
              include: {
                productOffering: { select: { id: true, name: true, displayName: true } },
              },
            },
          },
        },
      },
    });

    return orders.map(mapOrderToListDto);
  }

  async findById(userId: string, id: string) {
    const order = await prisma.productionOrder.findFirst({
      where: { id, customerId: userId },
      include: {
        items: {
          include: {
            productOfferingVersion: {
              include: {
                productOffering: { select: { id: true, name: true, displayName: true, thumbnailUrl: true } },
              },
            },
            configurations: true,
          },
        },
      },
    });

    if (!order) {
      throw ApiError.notFound('Order not found');
    }

    return mapOrderToDetailDto(order);
  }

  async create(userId: string, input: CreateProductionOrderInput) {
    const [settings, profile] = await Promise.all([
      deliverySettingsRepository.getOrCreate(),
      getVendorProfileForDelivery(userId),
    ]);

    const priceResult = await productsService.calculatePrice({
      productId: input.productId,
      versionId: input.versionId,
      quantity: input.quantity,
      selections: input.selections,
    });

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

    const snapshot = await pricingEngineService.persistSnapshot(priceResult);

    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: priceResult.versionId },
      select: { id: true },
    });

    if (!version) {
      throw ApiError.notFound('Product version not found');
    }

    const notesParts = [
      input.specialRemark?.trim(),
      input.pressline?.trim() ? `Pressline: ${input.pressline.trim()}` : null,
      input.fileOption ? `File option: ${input.fileOption}` : null,
    ].filter(Boolean);

    const order = await prisma.productionOrder.create({
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
            productOfferingVersionId: version.id,
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
      include: {
        items: {
          include: {
            productOfferingVersion: {
              include: {
                productOffering: { select: { id: true, name: true, displayName: true } },
              },
            },
            configurations: true,
          },
        },
      },
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
