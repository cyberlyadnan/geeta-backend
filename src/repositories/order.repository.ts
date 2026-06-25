import { Prisma, type DeliveryStatus, type DeliveryType, type ProductionOrderStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import type { PriceCalculationResult } from '../services/pricing-engine/pricing.types.js';

/** Minimal select for order create response — avoids deep include graph */
export const ORDER_DETAIL_SELECT = {
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
} satisfies Prisma.ProductionOrderSelect;

export const ORDER_LIST_SELECT = {
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
  deliveryStatus: true,
  createdAt: true,
  items: {
    take: 1,
    select: {
      quantity: true,
      productOfferingVersion: {
        select: {
          productOffering: { select: { name: true, displayName: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductionOrderSelect;

export interface CreateOrderData {
  orderNumber: string;
  customerId: string;
  orderName: string;
  status: ProductionOrderStatus;
  subtotal: number;
  deliveryCharge: number;
  taxAmount: number;
  totalAmount: number;
  deliveryRequired: boolean;
  deliveryType: DeliveryType | null;
  deliveryAddress: string | null;
  deliveryStatus: DeliveryStatus | null;
  notes: string | null;
  versionId: string;
  quantity: number;
  unitPrice: number;
  productTotal: number;
  priceSnapshotId: string;
  selections: Record<string, string>;
  priceLines: PriceCalculationResult['lines'];
}

export class OrderRepository {
  findManyByCustomer(customerId: string, skip: number, take: number) {
    return Promise.all([
      prisma.productionOrder.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: ORDER_LIST_SELECT,
      }),
      prisma.productionOrder.count({ where: { customerId } }),
    ]);
  }

  findByIdForCustomer(customerId: string, id: string) {
    return prisma.productionOrder.findFirst({
      where: { id, customerId },
      select: ORDER_DETAIL_SELECT,
    });
  }

  /** Atomic snapshot + order — single transaction, one round-trip */
  async createWithSnapshot(data: CreateOrderData) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: data.orderNumber,
          customerId: data.customerId,
          orderName: data.orderName,
          status: data.status,
          subtotal: data.subtotal,
          deliveryCharge: data.deliveryCharge,
          taxAmount: data.taxAmount,
          totalAmount: data.totalAmount,
          deliveryRequired: data.deliveryRequired,
          deliveryType: data.deliveryType,
          deliveryAddress: data.deliveryAddress,
          deliveryStatus: data.deliveryStatus,
          notes: data.notes,
          items: {
            create: {
              productOfferingVersionId: data.versionId,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
              totalPrice: data.productTotal,
              priceSnapshotId: data.priceSnapshotId,
              configurations: {
                create: Object.entries(data.selections).map(([fieldCode, selectedValue]) => {
                  const field = data.priceLines.find((l) => l.code === fieldCode);
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
        select: ORDER_DETAIL_SELECT,
      });
      return order;
    });
  }
}

export const orderRepository = new OrderRepository();
