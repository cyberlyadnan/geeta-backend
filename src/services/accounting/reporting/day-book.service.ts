import { JournalEntryStatus, type JournalSourceType, type Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { normaliseRange, round2 } from './report.types.js';

export interface DayBookQuery {
  from?: Date;
  to?: Date;
  sourceType?: JournalSourceType;
  accountId?: string;
  partyId?: string;
  search?: string;
  page: number;
  limit: number;
}

/**
 * The day book (Tally's "Daybook"): every voucher posted in a period, newest first, with its
 * lines. This is the screen an owner actually lives in — "what happened in the business today" —
 * and the one a CA scrolls when they want to see the shape of the month before pulling reports.
 */
export class DayBookService {
  async list(query: DayBookQuery) {
    const range = normaliseRange(query.from, query.to);
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.JournalEntryWhereInput = {
      entryDate: { gte: range.from, lte: range.to },
      ...(query.sourceType && { sourceType: query.sourceType }),
      ...(query.partyId && { partyId: query.partyId }),
      ...(query.accountId && { lines: { some: { accountId: query.accountId } } }),
      ...(query.search && {
        OR: [
          { voucherNumber: { contains: query.search, mode: 'insensitive' as const } },
          { narration: { contains: query.search, mode: 'insensitive' as const } },
          { partyName: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [entries, total, agg] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        include: {
          lines: {
            orderBy: { lineNumber: 'asc' },
            include: { account: { select: { code: true, name: true, type: true } } },
          },
          createdByUser: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.aggregate({ where, _sum: { totalDebit: true } }),
    ]);

    return {
      data: entries.map((entry) => ({
        id: entry.id,
        voucherNumber: entry.voucherNumber,
        entryDate: entry.entryDate.toISOString(),
        sourceType: entry.sourceType,
        status: entry.status,
        narration: entry.narration,
        partyName: entry.partyName,
        partyType: entry.partyType,
        partyId: entry.partyId,
        amount: round2(Number(entry.totalDebit)),
        isSystemGenerated: entry.isSystemGenerated,
        reversalOfId: entry.reversalOfId,
        createdBy: entry.createdByUser
          ? `${entry.createdByUser.firstName} ${entry.createdByUser.lastName}`
          : 'System',
        lines: entry.lines.map((line) => ({
          id: line.id,
          accountCode: line.account.code,
          accountName: line.account.name,
          accountType: line.account.type,
          debit: round2(Number(line.debit)),
          credit: round2(Number(line.credit)),
          description: line.description,
        })),
      })),
      totals: { amount: round2(Number(agg._sum.totalDebit ?? 0)) },
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  getEntry(id: string) {
    return prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { lineNumber: 'asc' }, include: { account: true } },
        createdByUser: { select: { firstName: true, lastName: true, email: true } },
        reversalOf: { select: { id: true, voucherNumber: true } },
        reversedBy: { select: { id: true, voucherNumber: true } },
      },
    });
  }

  /**
   * One account's ledger with a running balance — "show me everything that hit Cash in Hand".
   * The opening balance is computed from everything before the window so the running total is a
   * real balance rather than a period subtotal.
   */
  async accountLedger(accountId: string, options: { from?: Date; to?: Date; page: number; limit: number }) {
    const range = normaliseRange(options.from, options.to);
    const account = await prisma.chartOfAccount.findUnique({ where: { id: accountId } });
    if (!account) return null;

    const openingAgg = await prisma.journalLine.aggregate({
      where: {
        accountId,
        journalEntry: { status: JournalEntryStatus.POSTED, entryDate: { lt: range.from } },
      },
      _sum: { debit: true, credit: true },
    });
    const openingDebit = Number(openingAgg._sum.debit ?? 0);
    const openingCredit = Number(openingAgg._sum.credit ?? 0);
    const opening =
      account.normalBalance === 'DEBIT'
        ? round2(openingDebit - openingCredit)
        : round2(openingCredit - openingDebit);

    const where: Prisma.JournalLineWhereInput = {
      accountId,
      journalEntry: { status: JournalEntryStatus.POSTED, entryDate: { gte: range.from, lte: range.to } },
    };

    const [lines, total] = await Promise.all([
      prisma.journalLine.findMany({
        where,
        orderBy: [{ journalEntry: { entryDate: 'asc' } }, { createdAt: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          journalEntry: {
            select: { id: true, voucherNumber: true, entryDate: true, narration: true, sourceType: true, partyName: true },
          },
        },
      }),
      prisma.journalLine.count({ where }),
    ]);

    let running = opening;
    const rows = lines.map((line) => {
      const debit = round2(Number(line.debit));
      const credit = round2(Number(line.credit));
      running =
        account.normalBalance === 'DEBIT'
          ? round2(running + debit - credit)
          : round2(running + credit - debit);
      return {
        id: line.id,
        entryId: line.journalEntry.id,
        voucherNumber: line.journalEntry.voucherNumber,
        date: line.journalEntry.entryDate.toISOString(),
        narration: line.description ?? line.journalEntry.narration,
        partyName: line.journalEntry.partyName,
        sourceType: line.journalEntry.sourceType,
        debit,
        credit,
        balance: running,
      };
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        subType: account.subType,
        normalBalance: account.normalBalance,
      },
      openingBalance: opening,
      closingBalance: running,
      rows,
      meta: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages: Math.ceil(total / options.limit) || 1,
      },
    };
  }
}

export const dayBookService = new DayBookService();
