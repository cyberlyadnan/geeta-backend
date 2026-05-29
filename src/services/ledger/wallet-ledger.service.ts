import {
  FinancialAuditAction,
  PaymentMethod,
  Prisma,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import { randomBytes } from 'node:crypto';

export interface LedgerCreditInput {
  userId: string;
  amount: number;
  type: WalletTransactionType;
  paymentId?: string;
  orderId?: string;
  remarks?: string;
  paymentMethod?: PaymentMethod;
  createdById?: string;
  referenceNumber?: string;
  auditAction?: FinancialAuditAction;
  auditActorId?: string;
}

export interface LedgerDebitInput {
  userId: string;
  amount: number;
  type: WalletTransactionType;
  orderId?: string;
  remarks?: string;
  createdById?: string;
  referenceNumber?: string;
  auditAction?: FinancialAuditAction;
  auditActorId?: string;
}

function generateReference(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export class WalletLedgerService {
  async ensureWallet(userId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;
    let wallet = await db.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await db.wallet.create({
        data: { userId, currentBalance: 0, totalAdded: 0, totalSpent: 0, totalRefunds: 0 },
      });
    }
    return wallet;
  }

  async creditWallet(input: LedgerCreditInput, existingTx?: Prisma.TransactionClient) {
    if (input.amount <= 0) {
      throw ApiError.badRequest('Credit amount must be positive');
    }

    const run = async (tx: Prisma.TransactionClient) => {
      const wallet = await this.lockWallet(input.userId, tx);
      const amount = toDecimal(input.amount);
      const balanceBefore = wallet.currentBalance;
      const balanceAfter = balanceBefore.add(amount);

      const isRecharge =
        input.type === WalletTransactionType.RECHARGE ||
        input.type === WalletTransactionType.CREDIT ||
        input.type === WalletTransactionType.ADMIN_CREDIT ||
        input.type === WalletTransactionType.PROMOTIONAL;

      const isRefund = input.type === WalletTransactionType.REFUND;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          currentBalance: balanceAfter,
          ...(isRecharge && {
            totalAdded: wallet.totalAdded.add(amount),
            lastRechargeAt: new Date(),
          }),
          ...(isRefund && { totalRefunds: wallet.totalRefunds.add(amount) }),
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: input.userId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          type: input.type,
          status: WalletTransactionStatus.COMPLETED,
          amount,
          balanceBefore,
          balanceAfter,
          referenceNumber: input.referenceNumber ?? generateReference('TXN'),
          remarks: input.remarks,
          paymentMethod: input.paymentMethod,
          createdById: input.createdById,
        },
      });

      await tx.walletBalanceSnapshot.create({
        data: {
          walletId: wallet.id,
          balance: balanceAfter,
          reason: `CREDIT:${input.type}`,
        },
      });

      if (input.auditAction) {
        await tx.financialAuditLog.create({
          data: {
            action: input.auditAction,
            targetUserId: input.userId,
            actorId: input.auditActorId,
            walletId: wallet.id,
            paymentId: input.paymentId,
            transactionId: transaction.id,
            amount,
            balanceBefore,
            balanceAfter,
            remarks: input.remarks,
          },
        });
      }

      return { wallet: updatedWallet, transaction };
    };

    if (existingTx) return run(existingTx);
    return prisma.$transaction(run);
  }

  async debitWallet(input: LedgerDebitInput, existingTx?: Prisma.TransactionClient) {
    if (input.amount <= 0) {
      throw ApiError.badRequest('Debit amount must be positive');
    }

    const run = async (tx: Prisma.TransactionClient) => {
      const wallet = await this.lockWallet(input.userId, tx);
      const amount = toDecimal(input.amount);

      if (wallet.currentBalance.lessThan(amount)) {
        throw ApiError.badRequest('Insufficient wallet balance');
      }

      const balanceBefore = wallet.currentBalance;
      const balanceAfter = balanceBefore.sub(amount);

      const isOrder =
        input.type === WalletTransactionType.ORDER_PAYMENT ||
        input.type === WalletTransactionType.DEBIT;

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          currentBalance: balanceAfter,
          ...(isOrder && { totalSpent: wallet.totalSpent.add(amount) }),
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId: input.userId,
          orderId: input.orderId,
          type: input.type,
          status: WalletTransactionStatus.COMPLETED,
          amount,
          balanceBefore,
          balanceAfter,
          referenceNumber: input.referenceNumber ?? generateReference('TXN'),
          remarks: input.remarks,
          createdById: input.createdById,
        },
      });

      await tx.walletBalanceSnapshot.create({
        data: {
          walletId: wallet.id,
          balance: balanceAfter,
          reason: `DEBIT:${input.type}`,
        },
      });

      if (input.auditAction) {
        await tx.financialAuditLog.create({
          data: {
            action: input.auditAction,
            targetUserId: input.userId,
            actorId: input.auditActorId,
            walletId: wallet.id,
            transactionId: transaction.id,
            amount,
            balanceBefore,
            balanceAfter,
            remarks: input.remarks,
          },
        });
      }

      return { wallet: updatedWallet, transaction };
    };

    if (existingTx) return run(existingTx);
    return prisma.$transaction(run);
  }

  private async lockWallet(userId: string, tx: Prisma.TransactionClient) {
    await this.ensureWallet(userId, tx);
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM wallets WHERE user_id = ${userId} FOR UPDATE
    `;
    const id = rows[0]?.id;
    if (!id) throw ApiError.internal('Wallet lock failed');
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id } });
    return wallet;
  }

  mapWalletSummary(wallet: {
    currentBalance: Prisma.Decimal;
    totalAdded: Prisma.Decimal;
    totalSpent: Prisma.Decimal;
    totalRefunds: Prisma.Decimal;
    lastRechargeAt: Date | null;
    currency: string;
    id: string;
    userId: string;
  }) {
    return {
      walletId: wallet.id,
      userId: wallet.userId,
      currency: wallet.currency,
      currentBalance: decimalToNumber(wallet.currentBalance),
      totalAdded: decimalToNumber(wallet.totalAdded),
      totalSpent: decimalToNumber(wallet.totalSpent),
      totalRefunds: decimalToNumber(wallet.totalRefunds),
      lastRechargeAt: wallet.lastRechargeAt?.toISOString() ?? null,
    };
  }
}

export const walletLedgerService = new WalletLedgerService();
