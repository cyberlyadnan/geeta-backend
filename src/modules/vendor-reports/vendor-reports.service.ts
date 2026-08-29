import { Prisma, ProductionOrderStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { storageService } from '../../services/storage/index.js';
import type {
  InvoiceListQuery,
  PurchaseReportQuery,
  SummaryQuery,
  WalletStatementQuery,
} from './vendor-reports.validation.js';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: Prisma.Decimal | null | undefined): number => (value == null ? 0 : value.toNumber());

/** Orders that never became a real purchase — excluded from every spend total. */
const NON_BILLABLE_STATUSES: ProductionOrderStatus[] = [
  ProductionOrderStatus.DRAFT,
  ProductionOrderStatus.CANCELLED,
];

function periodKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  if (groupBy === 'day') return date.toISOString().slice(0, 10);
  if (groupBy === 'month') return date.toISOString().slice(0, 7);
  // ISO-ish week bucket: the Monday of the date's week, which sorts and labels cleanly.
  const monday = new Date(date);
  const day = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

/**
 * A vendor's own books.
 *
 * The purpose of this module is narrow and worth stating: a print vendor is running a business,
 * and their accountant will ask them for the same three things every quarter — what did you buy,
 * what invoices do you hold, and what went through your account. Everything here is scoped to the
 * calling vendor at the query level; there is no method that takes a vendor id from the client.
 *
 * The figures deliberately come from the same tables the admin's finance module reads, not from a
 * parallel calculation, so a vendor and the business can never open their respective screens and
 * disagree about what was spent.
 */
export class VendorReportsService {
  // ── Purchase register ─────────────────────────────────────────────────────

  async purchaseReport(vendorUserId: string, query: PurchaseReportQuery) {
    const where: Prisma.ProductionOrderWhereInput = {
      customerId: vendorUserId,
      status: { notIn: NON_BILLABLE_STATUSES },
      ...(query.status && { status: query.status }),
      ...(query.includeReprints ? {} : { isReprint: false }),
      ...((query.from ?? query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...((query.minAmount !== undefined || query.maxAmount !== undefined) && {
        totalAmount: {
          ...(query.minAmount !== undefined && { gte: new Prisma.Decimal(query.minAmount) }),
          ...(query.maxAmount !== undefined && { lte: new Prisma.Decimal(query.maxAmount) }),
        },
      }),
      ...(query.productFamilyId && {
        items: {
          some: {
            productOfferingVersion: {
              productOffering: { series: { family: { id: query.productFamilyId } } },
            },
          },
        },
      }),
      ...(query.search && {
        OR: [
          { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
          { orderName: { contains: query.search, mode: 'insensitive' as const } },
          {
            items: {
              some: {
                productOfferingVersion: {
                  productOffering: { name: { contains: query.search, mode: 'insensitive' as const } },
                },
              },
            },
          },
        ],
      }),
    };

    const orderBy: Prisma.ProductionOrderOrderByWithRelationInput =
      query.sort === 'oldest'
        ? { createdAt: 'asc' }
        : query.sort === 'highest'
          ? { totalAmount: 'desc' }
          : query.sort === 'lowest'
            ? { totalAmount: 'asc' }
            : { createdAt: 'desc' };

    const [orders, total, agg] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              productOfferingVersion: {
                select: {
                  productOffering: {
                    select: { name: true, hsnCode: true, series: { select: { name: true, family: { select: { id: true, name: true } } } } },
                  },
                },
              },
            },
          },
          dispatchBatchOrder: {
            select: {
              dispatchBatch: {
                select: { dispatchedAt: true, invoice: { select: { id: true, invoiceNumber: true, createdAt: true } } },
              },
            },
          },
          reprintOf: { select: { orderNumber: true } },
        },
      }),
      prisma.productionOrder.count({ where }),
      prisma.productionOrder.aggregate({
        where,
        _sum: { subtotal: true, deliveryCharge: true, taxAmount: true, totalAmount: true },
        _avg: { totalAmount: true },
      }),
    ]);

    const rows = orders.map((order) => {
      const item = order.items[0];
      const offering = item?.productOfferingVersion.productOffering;
      const invoice = order.dispatchBatchOrder?.dispatchBatch.invoice ?? null;
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        orderDate: order.createdAt.toISOString(),
        status: order.status,
        isReprint: order.isReprint,
        reprintOfOrderNumber: order.reprintOf?.orderNumber ?? null,
        productName: offering?.name ?? 'Custom job',
        productFamily: offering?.series.family.name ?? null,
        hsnCode: offering?.hsnCode ?? null,
        quantity: order.items.reduce((sum, line) => sum + line.quantity, 0),
        unitPrice: num(item?.unitPrice),
        subtotal: num(order.subtotal),
        deliveryCharge: num(order.deliveryCharge),
        taxAmount: num(order.taxAmount),
        totalAmount: num(order.totalAmount),
        dispatchedAt: order.dispatchBatchOrder?.dispatchBatch.dispatchedAt?.toISOString() ?? null,
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        invoiceDate: invoice?.createdAt.toISOString() ?? null,
      };
    });

    return {
      data: rows,
      totals: {
        orderCount: total,
        subtotal: round2(num(agg._sum.subtotal)),
        deliveryCharge: round2(num(agg._sum.deliveryCharge)),
        taxAmount: round2(num(agg._sum.taxAmount)),
        totalAmount: round2(num(agg._sum.totalAmount)),
        averageOrderValue: round2(num(agg._avg.totalAmount)),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  /**
   * The vendor's invoice register.
   *
   * Invoices are raised per dispatch batch, so one invoice can cover several orders — which is
   * exactly the thing a vendor cannot reconstruct from their order list, and the reason this page
   * exists separately from the purchase report.
   */
  async invoices(vendorUserId: string, query: InvoiceListQuery) {
    const where: Prisma.InvoiceWhereInput = {
      actorType: 'VENDOR',
      actorId: vendorUserId,
      ...((query.from ?? query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
          {
            dispatchBatch: {
              orders: {
                some: { order: { orderNumber: { contains: query.search, mode: 'insensitive' as const } } },
              },
            },
          },
        ],
      }),
    };

    const [invoices, total, agg] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          dispatchBatch: {
            select: {
              dispatchDate: true,
              dispatchedAt: true,
              orders: {
                select: {
                  order: { select: { id: true, orderNumber: true, orderName: true, totalAmount: true } },
                },
              },
            },
          },
        },
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where,
        _sum: { subtotal: true, deliveryCharge: true, gstAmount: true, total: true },
      }),
    ]);

    return {
      data: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt.toISOString(),
        billedToName: invoice.billedToName,
        gstNumber: invoice.gstNumber,
        placeOfSupply: invoice.placeOfSupply,
        subtotal: num(invoice.subtotal),
        deliveryCharge: num(invoice.deliveryCharge),
        gstRate: round2(num(invoice.gstRate) * 100),
        cgstAmount: num(invoice.cgstAmount),
        sgstAmount: num(invoice.sgstAmount),
        igstAmount: num(invoice.igstAmount),
        gstAmount: num(invoice.gstAmount),
        total: num(invoice.total),
        hasPdf: Boolean(invoice.pdfUrl),
        dispatchedAt: invoice.dispatchBatch.dispatchedAt?.toISOString() ?? null,
        orders: invoice.dispatchBatch.orders.map((link) => ({
          id: link.order.id,
          orderNumber: link.order.orderNumber,
          orderName: link.order.orderName,
          totalAmount: num(link.order.totalAmount),
        })),
      })),
      totals: {
        invoiceCount: total,
        taxableValue: round2(num(agg._sum.subtotal) + num(agg._sum.deliveryCharge)),
        gstAmount: round2(num(agg._sum.gstAmount)),
        total: round2(num(agg._sum.total)),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  /**
   * A time-limited link to one invoice PDF.
   *
   * Ownership is checked in the same query that fetches the row — a vendor asking for someone
   * else's invoice id gets "not found", not a 403 that confirms it exists.
   */
  async invoiceDownloadUrl(vendorUserId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, actorType: 'VENDOR', actorId: vendorUserId },
      select: { id: true, invoiceNumber: true, pdfUrl: true },
    });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (!invoice.pdfUrl) {
      throw ApiError.badRequest('This invoice is still being generated. Please try again in a moment.');
    }

    // pdfUrl holds the storage key's public URL; re-sign it so the link expires.
    const key = invoice.pdfUrl.split('/').slice(3).join('/');
    const presigned = await storageService.createPresignedDownload(key, {
      fileName: `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`,
      mimeType: 'application/pdf',
      disposition: 'attachment',
    });

    return {
      invoiceNumber: invoice.invoiceNumber,
      url: presigned.url,
      expiresAt: presigned.expiresAt,
    };
  }

  // ── Wallet statement ──────────────────────────────────────────────────────

  async walletStatement(vendorUserId: string, query: WalletStatementQuery) {
    const where: Prisma.WalletTransactionWhereInput = {
      userId: vendorUserId,
      status: 'COMPLETED',
      ...(query.type && { type: query.type as Prisma.WalletTransactionWhereInput['type'] }),
      ...((query.from ?? query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
    };

    const [transactions, total, wallet, credited, debited] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { productionOrder: { select: { orderNumber: true } } },
      }),
      prisma.walletTransaction.count({ where }),
      prisma.wallet.findUnique({ where: { userId: vendorUserId }, select: { currentBalance: true } }),
      prisma.walletTransaction.aggregate({
        where: { ...where, type: { in: ['CREDIT', 'RECHARGE', 'REFUND', 'ADMIN_CREDIT', 'PROMOTIONAL'] } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { ...where, type: { in: ['DEBIT', 'ORDER_PAYMENT', 'ADMIN_DEBIT'] } },
        _sum: { amount: true },
      }),
    ]);

    return {
      data: transactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.createdAt.toISOString(),
        type: transaction.type,
        amount: num(transaction.amount),
        balanceAfter: num(transaction.balanceAfter),
        reference: transaction.referenceNumber ?? transaction.reference,
        orderNumber: transaction.productionOrder?.orderNumber ?? null,
        description: transaction.description ?? transaction.remarks,
        method: transaction.paymentMethod,
      })),
      totals: {
        currentBalance: round2(num(wallet?.currentBalance)),
        credited: round2(num(credited._sum.amount)),
        debited: round2(num(debited._sum.amount)),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  // ── Dashboard summary ─────────────────────────────────────────────────────

  /** The numbers on the reports landing page, plus a spend trend to plot. */
  async summary(vendorUserId: string, query: SummaryQuery) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getFullYear(), to.getMonth() - 5, 1);
    const range = { gte: from, lte: to };

    const [orders, statusCounts, invoiceAgg, wallet, topProducts, reprintCount] = await Promise.all([
      prisma.productionOrder.findMany({
        where: { customerId: vendorUserId, status: { notIn: NON_BILLABLE_STATUSES }, createdAt: range },
        select: { createdAt: true, totalAmount: true, taxAmount: true, isReprint: true },
      }),
      prisma.productionOrder.groupBy({
        by: ['status'],
        where: { customerId: vendorUserId, createdAt: range },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { actorType: 'VENDOR', actorId: vendorUserId, createdAt: range },
        _sum: { total: true, gstAmount: true },
        _count: { _all: true },
      }),
      prisma.wallet.findUnique({ where: { userId: vendorUserId }, select: { currentBalance: true } }),
      prisma.productionOrderItem.groupBy({
        by: ['productOfferingVersionId'],
        where: { order: { customerId: vendorUserId, status: { notIn: NON_BILLABLE_STATUSES }, createdAt: range } },
        _sum: { totalPrice: true, quantity: true },
        _count: { _all: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 5,
      }),
      prisma.productionOrder.count({
        where: { customerId: vendorUserId, isReprint: true, createdAt: range },
      }),
    ]);

    const trendMap = new Map<string, { spend: number; orders: number }>();
    for (const order of orders) {
      const key = periodKey(order.createdAt, query.groupBy);
      const bucket = trendMap.get(key) ?? { spend: 0, orders: 0 };
      bucket.spend = round2(bucket.spend + num(order.totalAmount));
      bucket.orders += 1;
      trendMap.set(key, bucket);
    }

    const versionIds = topProducts.map((row) => row.productOfferingVersionId);
    const versions = versionIds.length
      ? await prisma.productOfferingVersion.findMany({
          where: { id: { in: versionIds } },
          select: { id: true, productOffering: { select: { name: true } } },
        })
      : [];
    const versionNames = new Map(versions.map((v) => [v.id, v.productOffering.name]));

    const totalSpend = round2(orders.reduce((sum, order) => sum + num(order.totalAmount), 0));

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        orderCount: orders.length,
        totalSpend,
        taxPaid: round2(orders.reduce((sum, order) => sum + num(order.taxAmount), 0)),
        averageOrderValue: orders.length === 0 ? 0 : round2(totalSpend / orders.length),
        invoiceCount: invoiceAgg._count._all,
        invoicedTotal: round2(num(invoiceAgg._sum.total)),
        gstOnInvoices: round2(num(invoiceAgg._sum.gstAmount)),
        walletBalance: round2(num(wallet?.currentBalance)),
        reprintCount,
      },
      trend: [...trendMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, value]) => ({ period, ...value })),
      byStatus: statusCounts.map((row) => ({ status: row.status, count: row._count._all })),
      topProducts: topProducts.map((row) => ({
        productName: versionNames.get(row.productOfferingVersionId) ?? 'Unknown product',
        orderCount: row._count._all,
        quantity: row._sum.quantity ?? 0,
        spend: round2(num(row._sum.totalPrice)),
      })),
    };
  }

  /** Product families this vendor has actually ordered — the filter dropdown's options. */
  async purchaseFilters(vendorUserId: string) {
    const families = await prisma.productFamily.findMany({
      where: {
        series: {
          some: {
            offerings: {
              some: {
                versions: {
                  some: { productionOrderItems: { some: { order: { customerId: vendorUserId } } } },
                },
              },
            },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { productFamilies: families };
  }
}

export const vendorReportsService = new VendorReportsService();
