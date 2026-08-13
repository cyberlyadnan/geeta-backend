import {
  Prisma,
  type ProductionOrderStatus,
} from '@prisma/client';
import { prisma } from '../config/database.js';

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
  walletDeducted: true,
  estimatedCompletionAt: true,
  createdAt: true,
  updatedAt: true,
  retailCustomer: { select: { id: true, name: true, phone: true } },
  items: {
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      productSnapshot: true,
      configurationSnapshot: true,
      sizeSnapshot: true,
      validationSnapshot: true,
      coverageSnapshot: true,
      priceSnapshot: {
        select: {
          subtotal: true,
          adjustmentTotal: true,
          discountTotal: true,
          taxTotal: true,
          grandTotal: true,
          calculation: true,
        },
      },
      configurations: {
        select: { fieldCode: true, fieldLabel: true, selectedLabel: true, selectedValue: true },
      },
      orderArtworks: {
        select: {
          id: true,
          fileRequirementCode: true,
          approvalStatus: true,
          adminNotes: true,
          approvedAt: true,
          // The staff member who approved / rejected / requested changes — so the vendor can
          // phone them about the revision without hunting through support.
          approvedBy: { select: { firstName: true, lastName: true, phone: true } },
          artworkFile: {
            select: {
              id: true,
              fileAsset: {
                select: { originalName: true, extension: true, mimeType: true, fileUrl: true, fileKey: true },
              },
            },
          },
          pinnedVersion: {
            select: {
              artworkVersion: {
                select: {
                  id: true,
                  previewUrl: true,
                  previewKey: true,
                  processingStatus: true,
                  validation: true,
                  metadata: true,
                  coverageAnalyses: true,
                },
              },
            },
          },
        },
      },
      productOfferingVersion: {
        select: {
          id: true,
          productOffering: {
            select: { id: true, name: true, displayName: true, thumbnailUrl: true, slug: true },
          },
        },
      },
    },
  },
  events: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      eventType: true,
      title: true,
      description: true,
      metadata: true,
      createdAt: true,
    },
  },
  walletTransactions: {
    where: { type: 'ORDER_PAYMENT' },
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      referenceNumber: true,
      createdAt: true,
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
  estimatedCompletionAt: true,
  items: {
    take: 1,
    select: {
      quantity: true,
      productOfferingVersion: {
        select: {
          productOffering: { select: { name: true, displayName: true, thumbnailUrl: true } },
        },
      },
      // Only the approval status is needed for the list row's badge — full artwork details are
      // loaded when the vendor opens the order.
      orderArtworks: { select: { approvalStatus: true } },
    },
  },
} satisfies Prisma.ProductionOrderSelect;

export interface OrderListFilters {
  search?: string;
  status?: ProductionOrderStatus;
  fromDate?: Date;
  toDate?: Date;
}

export class OrderRepository {
  findManyByCustomer(
    customerId: string,
    skip: number,
    take: number,
    filters: OrderListFilters = {},
  ) {
    const where: Prisma.ProductionOrderWhereInput = {
      customerId,
      ...(filters.status && { status: filters.status }),
      ...(filters.fromDate || filters.toDate
        ? {
            createdAt: {
              ...(filters.fromDate && { gte: filters.fromDate }),
              ...(filters.toDate && { lte: filters.toDate }),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { orderNumber: { contains: filters.search, mode: 'insensitive' } },
              { orderName: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return Promise.all([
      prisma.productionOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: ORDER_LIST_SELECT,
      }),
      prisma.productionOrder.count({ where }),
    ]);
  }

  findByIdForCustomer(customerId: string, id: string) {
    return prisma.productionOrder.findFirst({
      where: { id, customerId },
      select: ORDER_DETAIL_SELECT,
    });
  }

  countByStatus(customerId: string) {
    return prisma.productionOrder.groupBy({
      by: ['status'],
      where: { customerId },
      _count: { status: true },
    });
  }
}

export const orderRepository = new OrderRepository();

export type OrderDetailRecord = NonNullable<
  Awaited<ReturnType<OrderRepository['findByIdForCustomer']>>
>;

export type OrderListRecord = Awaited<ReturnType<OrderRepository['findManyByCustomer']>>[0][number];
