import { type AccountType, JournalEntryStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { type AccountBalanceRow, normaliseRange, round2 } from './report.types.js';

export interface TrialBalanceOptions {
  from?: Date;
  to?: Date;
  /** Hide accounts with no movement and no balance — the default a CA wants. */
  includeZeroBalances?: boolean;
}

export interface TrialBalance {
  range: { from: string; to: string };
  rows: AccountBalanceRow[];
  totals: { debit: number; credit: number; difference: number };
  /** The health check: a set of books that does not balance has a bug, not an opinion. */
  isBalanced: boolean;
}

/**
 * The trial balance — every account, its debits and its credits, for a period.
 *
 * It is the report a CA opens first, and it is also this system's own integrity test: because the
 * posting service refuses unbalanced entries, `isBalanced` must always be true. If it ever comes
 * back false, something has written to journal_lines outside the posting service.
 */
export class TrialBalanceService {
  async build(options: TrialBalanceOptions = {}): Promise<TrialBalance> {
    const range = normaliseRange(options.from, options.to);

    const grouped = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          entryDate: { gte: range.from, lte: range.to },
          status: JournalEntryStatus.POSTED,
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await prisma.chartOfAccount.findMany({
      where: options.includeZeroBalances ? {} : { id: { in: grouped.map((g) => g.accountId) } },
      orderBy: [{ code: 'asc' }],
    });

    const byAccount = new Map(grouped.map((g) => [g.accountId, g]));
    const rows: AccountBalanceRow[] = accounts.map((account) => {
      const sums = byAccount.get(account.id);
      const debit = round2(Number(sums?._sum.debit ?? 0));
      const credit = round2(Number(sums?._sum.credit ?? 0));
      const signed =
        account.normalBalance === 'DEBIT' ? round2(debit - credit) : round2(credit - debit);
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        subType: account.subType,
        debit,
        credit,
        balance: signed,
      };
    });

    const visible = options.includeZeroBalances
      ? rows
      : rows.filter((r) => r.debit !== 0 || r.credit !== 0);

    const totalDebit = round2(visible.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(visible.reduce((s, r) => s + r.credit, 0));

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      rows: visible,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
        difference: round2(totalDebit - totalCredit),
      },
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  /**
   * Closing balance per account as at a date — the primitive the balance sheet is built from.
   * Balance-sheet accounts are cumulative from the beginning of the books; P&L accounts are only
   * ever asked for within a period, which the caller controls with `from`.
   */
  async balancesAsAt(
    asAt: Date,
    options: { from?: Date; types?: AccountType[] } = {},
  ): Promise<Map<string, AccountBalanceRow>> {
    const where: Prisma.JournalLineWhereInput = {
      journalEntry: {
        status: JournalEntryStatus.POSTED,
        entryDate: { ...(options.from && { gte: options.from }), lte: asAt },
      },
      ...(options.types ? { account: { type: { in: options.types } } } : {}),
    };

    const grouped = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where,
      _sum: { debit: true, credit: true },
    });

    const accounts = await prisma.chartOfAccount.findMany({
      where: { id: { in: grouped.map((g) => g.accountId) } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    const out = new Map<string, AccountBalanceRow>();
    for (const group of grouped) {
      const account = byId.get(group.accountId);
      if (!account) continue;
      const debit = round2(Number(group._sum.debit ?? 0));
      const credit = round2(Number(group._sum.credit ?? 0));
      out.set(account.id, {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        subType: account.subType,
        debit,
        credit,
        balance: account.normalBalance === 'DEBIT' ? round2(debit - credit) : round2(credit - debit),
      });
    }
    return out;
  }
}

export const trialBalanceService = new TrialBalanceService();
