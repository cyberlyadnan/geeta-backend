import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { decimalToNumber } from '../../utils/money.js';
import type {
  FinanceSummaryQuery,
  GstExportQuery,
  GstReportQuery,
  LedgerExportQuery,
} from './admin-finance.validation.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Escapes a value for CSV: quote it, and double any embedded quote. */
function csvCell(value: unknown): string {
  if (value == null) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  // BOM so Excel opens UTF-8 correctly on Windows, which is where these get opened.
  return `﻿${lines.join('\r\n')}\r\n`;
}

function dateFilter(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from && { gte: from }), ...(to && { lte: to }) };
}

export class AdminFinanceService {
  /**
   * Headline numbers for the finance dashboard. Everything here is derived from FinancialEvent
   * — the ledger that Phase 2 made the single source of truth — rather than re-summing orders,
   * so the dashboard cannot drift from the ledger.
   */
  async summary(query: FinanceSummaryQuery) {
    const createdAt = dateFilter(query.from, query.to);
    const where: Prisma.FinancialEventWhereInput = createdAt ? { createdAt } : {};

    const [byType, byInstrument, creditAccounts, wallets, invoiceAgg] = await Promise.all([
      prisma.financialEvent.groupBy({
        by: ['eventType', 'direction'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.financialEvent.groupBy({
        by: ['instrument', 'direction'],
        where,
        _sum: { amount: true },
      }),
      prisma.creditAccount.aggregate({
        _sum: { outstandingBalance: true, creditLimit: true },
        _count: { _all: true },
      }),
      prisma.wallet.aggregate({ _sum: { currentBalance: true }, _count: { _all: true } }),
      prisma.invoice.aggregate({
        where: createdAt ? { createdAt } : {},
        _sum: { subtotal: true, deliveryCharge: true, gstAmount: true, total: true },
        _count: { _all: true },
      }),
    ]);

    const sumWhere = (direction: 'DEBIT' | 'CREDIT') =>
      round2(
        byType
          .filter((r) => r.direction === direction)
          .reduce((s, r) => s + decimalToNumber(r._sum.amount ?? new Prisma.Decimal(0)), 0),
      );

    return {
      range: {
        from: query.from?.toISOString() ?? null,
        to: query.to?.toISOString() ?? null,
      },
      totals: {
        debited: sumWhere('DEBIT'),
        credited: sumWhere('CREDIT'),
        eventCount: byType.reduce((s, r) => s + r._count._all, 0),
      },
      byEventType: byType.map((r) => ({
        eventType: r.eventType,
        direction: r.direction,
        amount: round2(decimalToNumber(r._sum.amount ?? new Prisma.Decimal(0))),
        count: r._count._all,
      })),
      byInstrument: byInstrument.map((r) => ({
        instrument: r.instrument,
        direction: r.direction,
        amount: round2(decimalToNumber(r._sum.amount ?? new Prisma.Decimal(0))),
      })),
      /** Point-in-time balances — these are current, not range-filtered. */
      balances: {
        walletTotal: round2(decimalToNumber(wallets._sum?.currentBalance ?? new Prisma.Decimal(0))),
        walletCount: wallets._count?._all ?? 0,
        creditOutstanding: round2(
          decimalToNumber(creditAccounts._sum.outstandingBalance ?? new Prisma.Decimal(0)),
        ),
        creditLimitTotal: round2(
          decimalToNumber(creditAccounts._sum.creditLimit ?? new Prisma.Decimal(0)),
        ),
        creditAccountCount: creditAccounts._count._all,
      },
      gst: {
        invoiceCount: invoiceAgg._count._all,
        taxableValue: round2(
          decimalToNumber(invoiceAgg._sum.subtotal ?? new Prisma.Decimal(0)) +
            decimalToNumber(invoiceAgg._sum.deliveryCharge ?? new Prisma.Decimal(0)),
        ),
        gstCollected: round2(decimalToNumber(invoiceAgg._sum.gstAmount ?? new Prisma.Decimal(0))),
        invoicedTotal: round2(decimalToNumber(invoiceAgg._sum.total ?? new Prisma.Decimal(0))),
      },
    };
  }

  /** Issued GST invoices for a period — the rows an accountant files a return from. */
  async gstReport(query: GstReportQuery) {
    const where = this.gstWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [invoices, total, agg] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { invoiceNumber: 'asc' },
        skip,
        take: query.limit,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where,
        _sum: { subtotal: true, deliveryCharge: true, gstAmount: true, total: true },
      }),
    ]);

    return {
      data: invoices.map((i) => this.mapInvoice(i)),
      totals: {
        subtotal: round2(decimalToNumber(agg._sum.subtotal ?? new Prisma.Decimal(0))),
        deliveryCharge: round2(decimalToNumber(agg._sum.deliveryCharge ?? new Prisma.Decimal(0))),
        gstAmount: round2(decimalToNumber(agg._sum.gstAmount ?? new Prisma.Decimal(0))),
        total: round2(decimalToNumber(agg._sum.total ?? new Prisma.Decimal(0))),
      },
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  async gstReportCsv(query: GstExportQuery) {
    const invoices = await prisma.invoice.findMany({
      where: this.gstWhere(query),
      orderBy: { invoiceNumber: 'asc' },
    });

    const csv = toCsv(
      [
        'Invoice number',
        'Date',
        'Billed to',
        'GST number',
        'Customer type',
        'Taxable value',
        'Delivery charge',
        'GST rate %',
        'GST amount',
        'Invoice total',
      ],
      invoices.map((i) => {
        const m = this.mapInvoice(i);
        return [
          m.invoiceNumber,
          m.createdAt.slice(0, 10),
          m.billedToName,
          m.gstNumber ?? 'Unregistered',
          m.actorType,
          m.subtotal.toFixed(2),
          m.deliveryCharge.toFixed(2),
          (m.gstRate * 100).toFixed(2),
          m.gstAmount.toFixed(2),
          m.total.toFixed(2),
        ];
      }),
    );

    return { csv, filename: this.filename('gst-report', query.from, query.to) };
  }

  async ledgerCsv(query: LedgerExportQuery) {
    const createdAt = dateFilter(query.from, query.to);
    const events = await prisma.financialEvent.findMany({
      where: {
        ...(createdAt && { createdAt }),
        ...(query.actorId && { actorId: query.actorId }),
        ...(query.actorType && { actorType: query.actorType }),
        ...(query.eventType && { eventType: query.eventType }),
      },
      orderBy: { createdAt: 'asc' },
    });

    const csv = toCsv(
      [
        'Date',
        'Event type',
        'Direction',
        'Instrument',
        'Amount',
        'Customer type',
        'Customer id',
        'Reference type',
        'Reference id',
      ],
      events.map((e) => [
        e.createdAt.toISOString(),
        e.eventType,
        e.direction,
        e.instrument,
        decimalToNumber(e.amount).toFixed(2),
        e.actorType,
        e.actorId,
        e.referenceType,
        e.referenceId,
      ]),
    );

    return { csv, filename: this.filename('general-ledger', query.from, query.to) };
  }

  private gstWhere(query: { from?: Date; to?: Date; actorType?: Prisma.EnumFinancialActorTypeFilter['equals'] }) {
    const createdAt = dateFilter(query.from, query.to);
    return {
      ...(createdAt && { createdAt }),
      ...(query.actorType && { actorType: query.actorType }),
    } as Prisma.InvoiceWhereInput;
  }

  private mapInvoice(i: Prisma.InvoiceGetPayload<object>) {
    return {
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      dispatchBatchId: i.dispatchBatchId,
      actorType: i.actorType,
      billedToName: i.billedToName,
      gstNumber: i.gstNumber,
      subtotal: decimalToNumber(i.subtotal),
      deliveryCharge: decimalToNumber(i.deliveryCharge),
      gstRate: decimalToNumber(i.gstRate),
      gstAmount: decimalToNumber(i.gstAmount),
      total: decimalToNumber(i.total),
      createdAt: i.createdAt.toISOString(),
    };
  }

  private filename(prefix: string, from?: Date, to?: Date): string {
    const part = (d?: Date) => (d ? d.toISOString().slice(0, 10) : 'all');
    return `${prefix}-${part(from)}-to-${part(to)}.csv`;
  }
}

export const adminFinanceService = new AdminFinanceService();
