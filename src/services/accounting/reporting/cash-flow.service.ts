import { AccountSubType, JournalEntryStatus } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { normaliseRange, round2 } from './report.types.js';

export interface CashFlowReport {
  range: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  inflows: { source: string; amount: number }[];
  outflows: { source: string; amount: number }[];
  totals: { inflow: number; outflow: number; net: number };
  daily: { date: string; inflow: number; outflow: number; closing: number }[];
}

const CASH_SUBTYPES = [AccountSubType.CASH, AccountSubType.BANK, AccountSubType.PAYMENT_GATEWAY];

/**
 * Where cash actually came from and went, by source type.
 *
 * A direct cash-flow statement rather than the indirect (start-from-profit) form, because for a
 * business this size "did more money come in than went out this month, and from what" is the
 * question being asked — not a reconciliation of accruals.
 */
export class CashFlowService {
  async build(options: { from?: Date; to?: Date }): Promise<CashFlowReport> {
    const range = normaliseRange(options.from, options.to);

    const cashAccounts = await prisma.chartOfAccount.findMany({
      where: { subType: { in: CASH_SUBTYPES } },
      select: { id: true },
    });
    const accountIds = cashAccounts.map((a) => a.id);
    if (accountIds.length === 0) {
      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        openingBalance: 0,
        closingBalance: 0,
        inflows: [],
        outflows: [],
        totals: { inflow: 0, outflow: 0, net: 0 },
        daily: [],
      };
    }

    const openingAgg = await prisma.journalLine.aggregate({
      where: {
        accountId: { in: accountIds },
        journalEntry: { status: JournalEntryStatus.POSTED, entryDate: { lt: range.from } },
      },
      _sum: { debit: true, credit: true },
    });
    const openingBalance = round2(
      Number(openingAgg._sum.debit ?? 0) - Number(openingAgg._sum.credit ?? 0),
    );

    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          status: JournalEntryStatus.POSTED,
          entryDate: { gte: range.from, lte: range.to },
        },
      },
      select: {
        debit: true,
        credit: true,
        journalEntry: { select: { entryDate: true, sourceType: true } },
      },
      orderBy: { journalEntry: { entryDate: 'asc' } },
    });

    const inflowBySource = new Map<string, number>();
    const outflowBySource = new Map<string, number>();
    const dailyMap = new Map<string, { inflow: number; outflow: number }>();

    for (const line of lines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      const source = line.journalEntry.sourceType;
      const day = line.journalEntry.entryDate.toISOString().slice(0, 10);
      const bucket = dailyMap.get(day) ?? { inflow: 0, outflow: 0 };

      if (debit > 0) {
        inflowBySource.set(source, round2((inflowBySource.get(source) ?? 0) + debit));
        bucket.inflow = round2(bucket.inflow + debit);
      }
      if (credit > 0) {
        outflowBySource.set(source, round2((outflowBySource.get(source) ?? 0) + credit));
        bucket.outflow = round2(bucket.outflow + credit);
      }
      dailyMap.set(day, bucket);
    }

    const totalInflow = round2([...inflowBySource.values()].reduce((s, v) => s + v, 0));
    const totalOutflow = round2([...outflowBySource.values()].reduce((s, v) => s + v, 0));

    let running = openingBalance;
    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => {
        running = round2(running + v.inflow - v.outflow);
        return { date, inflow: v.inflow, outflow: v.outflow, closing: running };
      });

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      openingBalance,
      closingBalance: round2(openingBalance + totalInflow - totalOutflow),
      inflows: [...inflowBySource.entries()]
        .map(([source, amount]) => ({ source, amount }))
        .sort((a, b) => b.amount - a.amount),
      outflows: [...outflowBySource.entries()]
        .map(([source, amount]) => ({ source, amount }))
        .sort((a, b) => b.amount - a.amount),
      totals: { inflow: totalInflow, outflow: totalOutflow, net: round2(totalInflow - totalOutflow) },
      daily,
    };
  }
}

export const cashFlowService = new CashFlowService();
