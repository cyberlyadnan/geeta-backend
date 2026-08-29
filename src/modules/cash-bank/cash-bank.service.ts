import {
  BankReconciliationStatus,
  BankTransactionStatus,
  type CashBankAccountType,
  JournalEntryStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  ACCOUNT_CODES,
  accountResolver,
  postingService,
  syncAccountingFor,
} from '../../services/accounting/index.js';
import type {
  BankTransactionListQuery,
  CreateBankTransactionInput,
  CreateCashBankAccountInput,
  ReconcileInput,
  UpdateCashBankAccountInput,
} from './cash-bank.validation.js';

const n = (v: Prisma.Decimal | null | undefined): number => (v == null ? 0 : v.toNumber());
const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

const LEDGER_CODE_FOR_TYPE: Record<CashBankAccountType, string> = {
  CASH: ACCOUNT_CODES.CASH_IN_HAND,
  BANK: ACCOUNT_CODES.BANK_ACCOUNTS,
  PAYMENT_GATEWAY: ACCOUNT_CODES.PAYMENT_GATEWAY_RECEIVABLE,
};

/**
 * Where money physically sits, and what moved through it.
 *
 * Balances here are never stored — they are the sum of the journal lines against the account's
 * ledger account. A cached balance is a second source of truth, and the moment it disagrees with
 * the ledger the whole system becomes unarguable. Reading it costs one aggregate query.
 */
export class CashBankService {
  async listAccounts(includeInactive = false) {
    const accounts = await prisma.cashBankAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { ledgerAccount: { select: { id: true, code: true, name: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    const balances = await this.balancesFor(accounts.map((a) => a.ledgerAccount.id));

    return accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      bankName: account.bankName,
      accountNumber: account.accountNumber ? `••••${account.accountNumber.slice(-4)}` : null,
      ifsc: account.ifsc,
      branch: account.branch,
      upiId: account.upiId,
      ledgerAccountCode: account.ledgerAccount.code,
      openingBalance: n(account.openingBalance),
      currentBalance: balances.get(account.ledgerAccount.id) ?? 0,
      isDefaultCash: account.isDefaultCash,
      isDefaultBank: account.isDefaultBank,
      isActive: account.isActive,
    }));
  }

  async createAccount(input: CreateCashBankAccountInput, userId: string) {
    const ledgerAccountId = await accountResolver.idFor(LEDGER_CODE_FOR_TYPE[input.type]);

    const account = await prisma.$transaction(async (tx) => {
      // Exactly one default per kind, so the posting rules never have to choose.
      if (input.isDefaultCash) {
        await tx.cashBankAccount.updateMany({ where: { isDefaultCash: true }, data: { isDefaultCash: false } });
      }
      if (input.isDefaultBank) {
        await tx.cashBankAccount.updateMany({ where: { isDefaultBank: true }, data: { isDefaultBank: false } });
      }

      return tx.cashBankAccount.create({
        data: {
          code: input.code,
          name: input.name,
          type: input.type,
          ledgerAccountId,
          bankName: input.bankName ?? null,
          accountNumber: input.accountNumber ?? null,
          ifsc: input.ifsc?.toUpperCase() ?? null,
          branch: input.branch ?? null,
          upiId: input.upiId ?? null,
          openingBalance: new Prisma.Decimal(input.openingBalance),
          openingBalanceAsOf: input.openingBalanceAsOf ?? null,
          isDefaultCash: input.isDefaultCash,
          isDefaultBank: input.isDefaultBank,
        },
      });
    });

    // An opening balance is a real accounting fact and has to be posted, or the balance sheet
    // starts life wrong. The other side goes to Owner's Capital, which is what an opening cash
    // balance actually represents when a business starts keeping books.
    if (input.openingBalance !== 0) {
      await postingService.postSafe({
        entryDate: input.openingBalanceAsOf ?? new Date(),
        sourceType: 'OPENING_BALANCE',
        sourceId: account.id,
        sourceKey: `cash-bank:${account.id}`,
        narration: `Opening balance for ${account.name}`,
        createdByUserId: userId,
        isSystemGenerated: false,
        lines:
          input.openingBalance > 0
            ? [
                { accountCode: LEDGER_CODE_FOR_TYPE[input.type], debit: input.openingBalance, description: 'Opening balance' },
                { accountCode: ACCOUNT_CODES.OWNERS_CAPITAL, credit: input.openingBalance, description: 'Opening balance' },
              ]
            : [
                { accountCode: ACCOUNT_CODES.OWNERS_CAPITAL, debit: -input.openingBalance, description: 'Opening balance' },
                { accountCode: LEDGER_CODE_FOR_TYPE[input.type], credit: -input.openingBalance, description: 'Opening balance' },
              ],
      });
    }

    return account;
  }

  async updateAccount(id: string, input: UpdateCashBankAccountInput) {
    const account = await prisma.cashBankAccount.findUnique({ where: { id } });
    if (!account) throw ApiError.notFound('Account not found');

    return prisma.$transaction(async (tx) => {
      if (input.isDefaultCash) {
        await tx.cashBankAccount.updateMany({ where: { isDefaultCash: true }, data: { isDefaultCash: false } });
      }
      if (input.isDefaultBank) {
        await tx.cashBankAccount.updateMany({ where: { isDefaultBank: true }, data: { isDefaultBank: false } });
      }
      return tx.cashBankAccount.update({
        where: { id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.bankName !== undefined && { bankName: input.bankName }),
          ...(input.accountNumber !== undefined && { accountNumber: input.accountNumber }),
          ...(input.ifsc !== undefined && { ifsc: input.ifsc?.toUpperCase() ?? null }),
          ...(input.branch !== undefined && { branch: input.branch }),
          ...(input.upiId !== undefined && { upiId: input.upiId }),
          ...(input.isDefaultCash !== undefined && { isDefaultCash: input.isDefaultCash }),
          ...(input.isDefaultBank !== undefined && { isDefaultBank: input.isDefaultBank }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
    });
  }

  async listTransactions(query: BankTransactionListQuery) {
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.accountId && { accountId: query.accountId }),
      ...(query.direction && { direction: query.direction }),
      ...(query.status && { status: query.status }),
      ...((query.from || query.to) && {
        valueDate: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
    };

    const [rows, total, agg] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, type: true } },
          journalEntry: { select: { voucherNumber: true } },
        },
        orderBy: [{ valueDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.groupBy({ by: ['direction'], where, _sum: { amount: true } }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountName: row.account.name,
        direction: row.direction,
        amount: n(row.amount),
        valueDate: row.valueDate.toISOString(),
        description: row.description,
        counterparty: row.counterparty,
        status: row.status,
        statementRef: row.statementRef,
        voucherNumber: row.journalEntry?.voucherNumber ?? null,
        reconciledAt: row.reconciledAt?.toISOString() ?? null,
      })),
      totals: {
        inflow: n(agg.find((a) => a.direction === 'IN')?._sum.amount ?? null),
        outflow: n(agg.find((a) => a.direction === 'OUT')?._sum.amount ?? null),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async createTransaction(input: CreateBankTransactionInput, userId: string) {
    const account = await prisma.cashBankAccount.findUnique({ where: { id: input.accountId } });
    if (!account?.isActive) throw ApiError.badRequest('Choose an active cash or bank account');

    if (input.contraAccountCode) {
      const contra = await prisma.chartOfAccount.findUnique({ where: { code: input.contraAccountCode } });
      if (!contra) throw ApiError.badRequest(`No ledger account with code ${input.contraAccountCode}`);
    }

    const created = await prisma.bankTransaction.create({
      data: {
        accountId: input.accountId,
        direction: input.direction,
        amount: new Prisma.Decimal(input.amount),
        valueDate: input.valueDate,
        description: input.description,
        counterparty: input.counterparty ?? null,
        statementRef: input.statementRef ?? null,
        status: BankTransactionStatus.CLEARED,
        createdById: userId,
        metadata: input.contraAccountCode ? { contraAccountCode: input.contraAccountCode } : {},
      },
    });

    syncAccountingFor('bank-transactions', userId);
    return created;
  }

  /**
   * Marks transactions as reconciled against a statement and records the exercise.
   *
   * The difference between the statement and the books is stored rather than hidden: a
   * reconciliation that does not tie is still worth keeping, because next month's reconciliation
   * needs to know that last month's gap existed.
   */
  async reconcile(accountId: string, input: ReconcileInput, userId: string) {
    const account = await prisma.cashBankAccount.findUnique({
      where: { id: accountId },
      include: { ledgerAccount: { select: { id: true } } },
    });
    if (!account) throw ApiError.notFound('Account not found');

    const bookBalance = (await this.balancesFor([account.ledgerAccount.id], input.statementDate)).get(
      account.ledgerAccount.id,
    ) ?? 0;

    return prisma.$transaction(async (tx) => {
      const reconciliation = await tx.bankReconciliation.create({
        data: {
          accountId,
          statementDate: input.statementDate,
          statementBalance: new Prisma.Decimal(input.statementBalance),
          bookBalance: new Prisma.Decimal(bookBalance),
          difference: new Prisma.Decimal(round2(input.statementBalance - bookBalance)),
          status:
            Math.abs(input.statementBalance - bookBalance) < 0.01
              ? BankReconciliationStatus.COMPLETED
              : BankReconciliationStatus.IN_PROGRESS,
          completedAt: new Date(),
          createdById: userId,
        },
      });

      await tx.bankTransaction.updateMany({
        where: { id: { in: input.transactionIds }, accountId },
        data: {
          status: BankTransactionStatus.RECONCILED,
          reconciledAt: new Date(),
          reconciledById: userId,
          reconciliationId: reconciliation.id,
        },
      });

      return reconciliation;
    });
  }

  listReconciliations(accountId: string) {
    return prisma.bankReconciliation.findMany({
      where: { accountId },
      orderBy: { statementDate: 'desc' },
      take: 24,
      include: { _count: { select: { transactions: true } } },
    });
  }

  /** Ledger balance per account id, derived — never cached. */
  private async balancesFor(ledgerAccountIds: string[], asAt?: Date): Promise<Map<string, number>> {
    if (ledgerAccountIds.length === 0) return new Map();
    const grouped = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: ledgerAccountIds },
        journalEntry: { status: JournalEntryStatus.POSTED, ...(asAt ? { entryDate: { lte: asAt } } : {}) },
      },
      _sum: { debit: true, credit: true },
    });
    return new Map(
      grouped.map((row) => [row.accountId, round2(n(row._sum.debit) - n(row._sum.credit))]),
    );
  }
}

export const cashBankService = new CashBankService();
