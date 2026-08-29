import { JournalEntryStatus, Prisma, type FiscalPeriodStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  accountResolver,
  dayBookService,
  ensureChartOfAccounts,
  financeSettingsService,
  fiscalService,
  normalBalanceFor,
  postingService,
  runAccountingProjection,
} from '../../services/accounting/index.js';
import type {
  AccountLedgerQuery,
  ChartQuery,
  CreateAccountInput,
  DayBookQueryInput,
  FinanceSettingsInput,
  ManualJournalInput,
  ReverseEntryInput,
  RunProjectionInput,
  UpdateAccountInput,
} from './admin-accounting.validation.js';

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Administration of the books themselves: the chart of accounts, the voucher register, period
 * locking, engine settings, and the manual journal.
 *
 * The manual journal is the escape hatch every accounting system needs and most in-house ones
 * forget — depreciation, an owner's capital introduction, a year-end provision, a correction the
 * automated rules cannot express. Without it the books are only as complete as the flows someone
 * remembered to automate.
 */
export class AdminAccountingService {
  // ── Chart of accounts ─────────────────────────────────────────────────────

  async chartOfAccounts(query: ChartQuery) {
    const accounts = await prisma.chartOfAccount.findMany({
      where: {
        ...(query.type && { type: query.type }),
        ...(query.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ code: 'asc' }],
      include: { _count: { select: { journalLines: true } } },
    });

    let balances = new Map<string, number>();
    if (query.withBalances) {
      const grouped = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: {
            status: JournalEntryStatus.POSTED,
            ...(query.asAt ? { entryDate: { lte: query.asAt } } : {}),
          },
        },
        _sum: { debit: true, credit: true },
      });
      balances = new Map(
        grouped.map((row) => [
          row.accountId,
          round2(Number(row._sum.debit ?? 0) - Number(row._sum.credit ?? 0)),
        ]),
      );
    }

    return accounts.map((account) => {
      const raw = balances.get(account.id) ?? 0;
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        subType: account.subType,
        normalBalance: account.normalBalance,
        parentId: account.parentId,
        description: account.description,
        isSystem: account.isSystem,
        isActive: account.isActive,
        sortOrder: account.sortOrder,
        lineCount: account._count.journalLines,
        // Present the balance the way the account naturally carries it, so a liability of 50,000
        // reads as 50,000 rather than -50,000.
        balance: account.normalBalance === 'DEBIT' ? raw : round2(-raw),
      };
    });
  }

  async createAccount(input: CreateAccountInput) {
    const existing = await prisma.chartOfAccount.findUnique({ where: { code: input.code } });
    if (existing) throw ApiError.badRequest(`Account code ${input.code} is already in use`);

    let parentId: string | null = null;
    if (input.parentCode) {
      const parent = await prisma.chartOfAccount.findUnique({ where: { code: input.parentCode } });
      if (!parent) throw ApiError.badRequest(`No account with code ${input.parentCode} to nest under`);
      parentId = parent.id;
    }

    const account = await prisma.chartOfAccount.create({
      data: {
        code: input.code,
        name: input.name,
        type: input.type,
        subType: input.subType,
        normalBalance: normalBalanceFor(input.type),
        parentId,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isSystem: false,
      },
    });

    accountResolver.invalidate();
    return account;
  }

  async updateAccount(id: string, input: UpdateAccountInput) {
    const account = await prisma.chartOfAccount.findUnique({ where: { id } });
    if (!account) throw ApiError.notFound('Account not found');

    if (account.isSystem && input.isActive === false) {
      throw ApiError.badRequest(
        'This account is referenced by the automatic posting rules and cannot be deactivated. Rename it instead.',
      );
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    accountResolver.invalidate();
    return updated;
  }

  async reseedChart() {
    const result = await ensureChartOfAccounts();
    accountResolver.invalidate();
    return result;
  }

  // ── Day book & journal ────────────────────────────────────────────────────

  async dayBook(query: DayBookQueryInput) {
    return dayBookService.list(query);
  }

  async journalEntry(id: string) {
    const entry = await dayBookService.getEntry(id);
    if (!entry) throw ApiError.notFound('Journal entry not found');
    return entry;
  }

  async accountLedger(accountId: string, query: AccountLedgerQuery) {
    const result = await dayBookService.accountLedger(accountId, query);
    if (!result) throw ApiError.notFound('Account not found');
    return result;
  }

  async postManualJournal(input: ManualJournalInput, userId: string, isSuperAdmin: boolean) {
    const totalDebit = round2(input.lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(input.lines.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw ApiError.badRequest(
        `This entry does not balance — debits ${totalDebit.toFixed(2)}, credits ${totalCredit.toFixed(2)}`,
      );
    }
    if (totalDebit === 0) throw ApiError.badRequest('A journal entry cannot be for zero');

    const { entry } = await postingService.post({
      entryDate: input.entryDate,
      sourceType: 'MANUAL_JOURNAL',
      // Manual entries have no source document, so the key is generated — this is the one place a
      // duplicate submission is a real risk, which is why the UI disables the button on submit.
      sourceKey: `manual:${userId}:${String(Date.now())}`,
      narration: input.narration,
      createdByUserId: userId,
      isSystemGenerated: false,
      allowClosedPeriod: input.allowClosedPeriod && isSuperAdmin,
      lines: input.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      })),
    });

    return entry;
  }

  async reverseEntry(id: string, input: ReverseEntryInput, userId: string, isSuperAdmin: boolean) {
    return postingService.reverse(id, {
      reason: input.reason,
      userId,
      reversalDate: input.reversalDate,
      allowClosedPeriod: isSuperAdmin,
    });
  }

  // ── Periods ───────────────────────────────────────────────────────────────

  async fiscalYears() {
    const years = await fiscalService.listYears();
    const counts = await prisma.journalEntry.groupBy({
      by: ['fiscalYear', 'fiscalPeriod'],
      _count: { _all: true },
      _sum: { totalDebit: true },
    });
    const countKey = (y: number, p: number) => `${String(y)}:${String(p)}`;
    const byPeriod = new Map(
      counts.map((c) => [countKey(c.fiscalYear, c.fiscalPeriod), { count: c._count._all, amount: round2(Number(c._sum.totalDebit ?? 0)) }]),
    );

    return years.map((year) => ({
      id: year.id,
      label: year.label,
      startDate: year.startDate.toISOString(),
      endDate: year.endDate.toISOString(),
      status: year.status,
      isCurrent: year.isCurrent,
      periods: year.periods.map((period) => {
        const stats = byPeriod.get(countKey(Number(year.label.slice(0, 4)), period.periodNumber));
        return {
          id: period.id,
          periodNumber: period.periodNumber,
          label: period.label,
          startDate: period.startDate.toISOString(),
          endDate: period.endDate.toISOString(),
          status: period.status,
          closedAt: period.closedAt?.toISOString() ?? null,
          entryCount: stats?.count ?? 0,
          totalAmount: stats?.amount ?? 0,
        };
      }),
    }));
  }

  async ensureCurrentYear() {
    const fiscalYear = await fiscalService.currentFiscalYear();
    return fiscalService.ensureYear(fiscalYear);
  }

  async setPeriodStatus(periodId: string, status: FiscalPeriodStatus, userId: string, notes?: string) {
    return fiscalService.setPeriodStatus(periodId, status, userId, notes);
  }

  // ── Settings & projection ─────────────────────────────────────────────────

  async getSettings() {
    return financeSettingsService.get();
  }

  async updateSettings(input: FinanceSettingsInput, userId: string) {
    const data: Prisma.FinanceSettingsUpdateInput = {
      ...(input.homeStateCode && { homeStateCode: input.homeStateCode }),
      ...(input.defaultGstRatePercent !== undefined && {
        defaultGstRatePercent: new Prisma.Decimal(input.defaultGstRatePercent),
      }),
      ...(input.defaultHsnCode && { defaultHsnCode: input.defaultHsnCode }),
      ...(input.fiscalYearStartMonth && { fiscalYearStartMonth: input.fiscalYearStartMonth }),
      ...(input.autoPostingEnabled !== undefined && { autoPostingEnabled: input.autoPostingEnabled }),
      ...(input.b2clThreshold !== undefined && { b2clThreshold: new Prisma.Decimal(input.b2clThreshold) }),
      ...(input.booksBeginFrom !== undefined && { booksBeginFrom: input.booksBeginFrom }),
      ...(input.enableTds !== undefined && { enableTds: input.enableTds }),
      ...(input.defaultTdsRatePercent !== undefined && {
        defaultTdsRatePercent: new Prisma.Decimal(input.defaultTdsRatePercent),
      }),
      updatedBy: { connect: { id: userId } },
    };
    return financeSettingsService.update(data);
  }

  /** Manual "sync now" — the same projection the scheduler runs, on demand. */
  async runProjection(input: RunProjectionInput, userId: string) {
    return runAccountingProjection({
      since: input.since,
      adapters: input.adapters,
      batchSize: input.batchSize,
      trigger: 'admin',
      createdById: userId,
    });
  }

  projectionHistory() {
    return prisma.accountingProjectionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 25 });
  }
}

export const adminAccountingService = new AdminAccountingService();
