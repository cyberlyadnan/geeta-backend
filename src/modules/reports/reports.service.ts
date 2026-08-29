import { type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { monthLabel, round2, toGroupedRows } from './reports.utils.js';
import type { SalesRegisterRow } from './reports.types.js';
import type {
  CollectionsQuery,
  ExpenseSummaryQuery,
  SalesRegisterQuery,
} from './reports.validation.js';

const n = (v: Prisma.Decimal | null | undefined): number => (v == null ? 0 : Number(v));

/**
 * Operational money reports — the ones a manager reads, as distinct from the statutory statements
 * a CA reads (those live in the accounting reporting services).
 *
 * The split matters: a sales register answers "what did we sell and has it been paid for", which
 * is a question about documents and customers. A P&L answers "did we make money", which is a
 * question about accounts. Building both from the same query would compromise both.
 */
export class ReportsService {
  /** Invoice-by-invoice sales, with what has actually been collected against each. */
  async salesRegister(query: SalesRegisterQuery) {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.actorType && { actorType: query.actorType }),
      ...((query.from || query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
          { billedToName: { contains: query.search, mode: 'insensitive' as const } },
          { gstNumber: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [invoices, total, agg] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { invoiceNumber: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          dispatchBatch: {
            select: { orders: { select: { order: { select: { id: true, orderNumber: true } } } } },
          },
        },
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where,
        _sum: { subtotal: true, deliveryCharge: true, gstAmount: true, total: true },
      }),
    ]);

    // What has been collected against each invoice: counter receipts plus wallet/Udhar advances
    // against the orders it covers. Both, because retail and vendor customers pay differently.
    const orderIds = invoices.flatMap((i) => i.dispatchBatch.orders.map((o) => o.order.id));
    const [receipts, events] = await Promise.all([
      orderIds.length
        ? prisma.orderPaymentReceipt.groupBy({
            by: ['orderId'],
            where: { orderId: { in: orderIds } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      orderIds.length
        ? prisma.financialEvent.groupBy({
            by: ['referenceId', 'direction'],
            where: { referenceType: 'ORDER', referenceId: { in: orderIds } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);

    const receiptByOrder = new Map(receipts.map((r) => [r.orderId, n(r._sum.amount)]));
    const eventByOrder = new Map<string, number>();
    for (const row of events) {
      const signed = row.direction === 'DEBIT' ? n(row._sum.amount) : -n(row._sum.amount);
      eventByOrder.set(row.referenceId, round2((eventByOrder.get(row.referenceId) ?? 0) + signed));
    }

    const rows: SalesRegisterRow[] = invoices.map((invoice) => {
      const orders = invoice.dispatchBatch.orders.map((o) => o.order);
      const received = round2(
        orders.reduce(
          (sum, order) => sum + (receiptByOrder.get(order.id) ?? 0) + (eventByOrder.get(order.id) ?? 0),
          0,
        ),
      );
      const invoiceTotal = n(invoice.total);
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.createdAt.toISOString(),
        customerName: invoice.billedToName,
        gstNumber: invoice.gstNumber,
        customerType: invoice.actorType,
        orderNumbers: orders.map((o) => o.orderNumber),
        subtotal: n(invoice.subtotal),
        deliveryCharge: n(invoice.deliveryCharge),
        gstAmount: n(invoice.gstAmount),
        total: invoiceTotal,
        amountReceived: Math.min(received, invoiceTotal),
        outstanding: round2(Math.max(0, invoiceTotal - received)),
      };
    });

    return {
      data: rows,
      totals: {
        subtotal: n(agg._sum.subtotal),
        deliveryCharge: n(agg._sum.deliveryCharge),
        gstAmount: n(agg._sum.gstAmount),
        total: n(agg._sum.total),
        received: round2(rows.reduce((s, r) => s + r.amountReceived, 0)),
        outstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  /** Money actually collected at the counter, grouped the way the question is usually asked. */
  async collections(query: CollectionsQuery) {
    const receipts = await prisma.orderPaymentReceipt.findMany({
      where:
        query.from || query.to
          ? { createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } }
          : {},
      include: { recordedBy: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = new Map<string, { label: string; amount: number; count: number }>();
    for (const receipt of receipts) {
      const key =
        query.groupBy === 'method'
          ? receipt.method
          : query.groupBy === 'staff'
            ? receipt.recordedById
            : receipt.createdAt.toISOString().slice(0, 10);
      const label =
        query.groupBy === 'staff'
          ? `${receipt.recordedBy.firstName} ${receipt.recordedBy.lastName}`
          : key;

      const bucket = buckets.get(key) ?? { label, amount: 0, count: 0 };
      bucket.amount = round2(bucket.amount + n(receipt.amount));
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    return {
      groupBy: query.groupBy,
      rows: toGroupedRows(buckets),
      total: round2(receipts.reduce((s, r) => s + n(r.amount), 0)),
      count: receipts.length,
    };
  }

  /** Where the money went, grouped by whichever dimension is being questioned. */
  async expenseSummary(query: ExpenseSummaryQuery) {
    const expenses = await prisma.expense.findMany({
      where: {
        status: { in: ['APPROVED', 'PAID'] },
        ...((query.from || query.to) && {
          expenseDate: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
        }),
      },
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { expenseDate: 'asc' },
    });

    const buckets = new Map<string, { label: string; amount: number; count: number }>();
    for (const expense of expenses) {
      let key: string;
      let label: string;
      switch (query.groupBy) {
        case 'month':
          key = `${expense.expenseDate.getFullYear()}-${String(expense.expenseDate.getMonth() + 1).padStart(2, '0')}`;
          label = monthLabel(expense.expenseDate);
          break;
        case 'department':
          key = expense.departmentId ?? 'unassigned';
          label = expense.department?.name ?? 'Unassigned';
          break;
        case 'payee':
          key = expense.supplierId ?? expense.payeeName ?? 'unknown';
          label = expense.supplier?.name ?? expense.payeeName ?? 'Unknown payee';
          break;
        default:
          key = expense.categoryId;
          label = expense.category.name;
      }

      const bucket = buckets.get(key) ?? { label, amount: 0, count: 0 };
      bucket.amount = round2(bucket.amount + Number(expense.totalAmount));
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    return {
      groupBy: query.groupBy,
      rows: toGroupedRows(buckets),
      total: round2(expenses.reduce((s, e) => s + Number(e.totalAmount), 0)),
      count: expenses.length,
    };
  }
}

export const reportsService = new ReportsService();
