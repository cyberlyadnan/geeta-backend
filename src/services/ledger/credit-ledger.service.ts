import { FinancialActorType, FinancialReferenceType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber, formatInr } from '../../utils/money.js';
import { financialEventService } from './financial-event.service.js';

export interface SetCreditLimitInput {
  actorType: FinancialActorType;
  actorId: string;
  creditLimit: number;
}

export interface DrawOnCreditInput {
  actorType: FinancialActorType;
  actorId: string;
  amount: number;
  referenceType?: FinancialReferenceType;
  referenceId?: string;
  recordedByUserId: string;
  note?: string;
}

export interface RecordRepaymentInput {
  actorType: FinancialActorType;
  actorId: string;
  amount: number;
  recordedByUserId: string;
  note?: string;
}

export interface ListCreditTransactionsQuery {
  creditAccountId: string;
  page: number;
  limit: number;
}

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type CreditLedgerDb = Pick<typeof prisma, 'creditAccount' | 'creditTransaction' | '$transaction'>;

function mapAccount(account: {
  id: string;
  actorType: FinancialActorType;
  actorId: string;
  creditLimit: Prisma.Decimal;
  outstandingBalance: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    actorType: account.actorType,
    actorId: account.actorId,
    creditLimit: decimalToNumber(account.creditLimit),
    outstandingBalance: decimalToNumber(account.outstandingBalance),
    availableCredit: decimalToNumber(account.creditLimit.sub(account.outstandingBalance)),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

/**
 * Udhar (credit) ledger. Mirrors wallet-ledger.service.ts's row-locked debit/credit rigor:
 * every draw and repayment locks the CreditAccount row with SELECT ... FOR UPDATE inside a
 * transaction before reading/writing its balance, so two concurrent draws on the same account
 * can never both pass the limit check and land — the second waits for the first to commit.
 *
 * Unlike wallets, a CreditAccount is never auto-created — a limit must be set explicitly by an
 * admin (setCreditLimit) before any draw is possible.
 */
export class CreditLedgerService {
  constructor(private readonly db: CreditLedgerDb = prisma) {}

  async setCreditLimit(input: SetCreditLimitInput) {
    if (input.creditLimit < 0) {
      throw ApiError.badRequest('Credit limit cannot be negative');
    }
    const account = await this.db.creditAccount.upsert({
      where: { actorType_actorId: { actorType: input.actorType, actorId: input.actorId } },
      create: {
        actorType: input.actorType,
        actorId: input.actorId,
        creditLimit: toDecimal(input.creditLimit),
      },
      update: { creditLimit: toDecimal(input.creditLimit) },
    });
    return mapAccount(account);
  }

  async getAccount(actorType: FinancialActorType, actorId: string) {
    const account = await this.db.creditAccount.findUnique({
      where: { actorType_actorId: { actorType, actorId } },
    });
    if (!account) throw ApiError.notFound('No credit account has been set up for this actor yet');
    return mapAccount(account);
  }

  async drawOnCredit(input: DrawOnCreditInput) {
    if (input.amount <= 0) {
      throw ApiError.badRequest('Draw amount must be positive');
    }

    return this.db.$transaction(async (tx) => {
      const account = await this.lockAccount(input.actorType, input.actorId, tx);
      const amount = toDecimal(input.amount);
      const newOutstanding = account.outstandingBalance.add(amount);

      if (newOutstanding.greaterThan(account.creditLimit)) {
        const available = account.creditLimit.sub(account.outstandingBalance);
        const availableDisplay = available.isNegative() ? 0 : decimalToNumber(available);
        throw ApiError.badRequest(`This exceeds available credit (${formatInr(availableDisplay)} remaining)`);
      }

      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { outstandingBalance: newOutstanding },
      });

      const creditTransaction = await tx.creditTransaction.create({
        data: {
          creditAccountId: account.id,
          type: 'DRAW',
          amount,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          recordedByUserId: input.recordedByUserId,
          note: input.note,
        },
      });

      const event = await financialEventService.record(
        {
          actorType: input.actorType,
          actorId: input.actorId,
          eventType: 'UDHAR_DRAW',
          amount,
          direction: 'DEBIT',
          instrument: 'UDHAR',
          referenceType: input.referenceType ?? 'DRAW',
          referenceId: input.referenceId ?? creditTransaction.id,
          createdByUserId: input.recordedByUserId,
        },
        tx,
      );

      return { account: mapAccount(updated), transaction: creditTransaction, event };
    });
  }

  async recordRepayment(input: RecordRepaymentInput) {
    if (input.amount <= 0) {
      throw ApiError.badRequest('Repayment amount must be positive');
    }

    return this.db.$transaction(async (tx) => {
      const account = await this.lockAccount(input.actorType, input.actorId, tx);
      const amount = toDecimal(input.amount);
      // Cap at 0 on over-repayment — the full repayment amount is still recorded on the
      // CreditTransaction/FinancialEvent below, only the running balance floors at 0.
      const proposed = account.outstandingBalance.sub(amount);
      const newOutstanding = proposed.isNegative() ? new Prisma.Decimal(0) : proposed;

      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { outstandingBalance: newOutstanding },
      });

      const creditTransaction = await tx.creditTransaction.create({
        data: {
          creditAccountId: account.id,
          type: 'REPAYMENT',
          amount,
          recordedByUserId: input.recordedByUserId,
          note: input.note,
        },
      });

      const event = await financialEventService.record(
        {
          actorType: input.actorType,
          actorId: input.actorId,
          eventType: 'UDHAR_REPAYMENT',
          amount,
          direction: 'CREDIT',
          instrument: 'UDHAR',
          referenceType: 'REPAYMENT',
          referenceId: creditTransaction.id,
          createdByUserId: input.recordedByUserId,
        },
        tx,
      );

      return { account: mapAccount(updated), transaction: creditTransaction, event };
    });
  }

  async listTransactions(query: ListCreditTransactionsQuery) {
    const { creditAccountId, page, limit } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.db.creditTransaction.findMany({
        where: { creditAccountId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.creditTransaction.count({ where: { creditAccountId } }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        type: t.type,
        amount: decimalToNumber(t.amount),
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        recordedByUserId: t.recordedByUserId,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  private async lockAccount(actorType: FinancialActorType, actorId: string, tx: Prisma.TransactionClient) {
    const existing = await tx.creditAccount.findUnique({
      where: { actorType_actorId: { actorType, actorId } },
    });
    if (!existing) {
      throw ApiError.badRequest('No credit account has been set up for this actor yet — set a credit limit first');
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM credit_accounts WHERE id = ${existing.id} FOR UPDATE
    `;
    const id = rows[0]?.id;
    if (!id) throw ApiError.internal('Credit account lock failed');
    return tx.creditAccount.findUniqueOrThrow({ where: { id } });
  }
}

export const creditLedgerService = new CreditLedgerService();
