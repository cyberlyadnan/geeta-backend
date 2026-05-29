import { FinancialAuditAction, WalletTransactionType, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { walletLedgerService } from '../../services/ledger/index.js';
import { decimalToNumber } from '../../utils/money.js';
import type { AdminWalletAdjustInput, ListAdminWalletsQuery } from './admin-wallets.validation.js';

export class AdminWalletsService {
  async list(query: ListAdminWalletsQuery) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WalletWhereInput = search
      ? {
          user: {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.wallet.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              vendorProfile: { select: { businessName: true, vendorCode: true } },
            },
          },
        },
      }),
      prisma.wallet.count({ where }),
    ]);

    return {
      items: items.map((w) => ({
        ...walletLedgerService.mapWalletSummary(w),
        user: w.user,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getByUserId(userId: string) {
    const wallet = await walletLedgerService.ensureWallet(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        vendorProfile: { select: { businessName: true, vendorCode: true } },
      },
    });
    if (!user) throw ApiError.notFound('User not found');

    const [transactions, payments, audits] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.financialAuditLog.findMany({
        where: { targetUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return {
      wallet: walletLedgerService.mapWalletSummary(wallet),
      user,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        amount: decimalToNumber(t.amount),
        balanceAfter: decimalToNumber(t.balanceAfter),
        referenceNumber: t.referenceNumber,
        remarks: t.remarks,
        createdAt: t.createdAt.toISOString(),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: decimalToNumber(p.amount),
        status: p.status,
        paymentMethod: p.paymentMethod,
        webhookVerified: p.webhookVerified,
        createdAt: p.createdAt.toISOString(),
      })),
      auditLogs: audits,
    };
  }

  async credit(input: AdminWalletAdjustInput, actorId: string) {
    const result = await walletLedgerService.creditWallet({
      userId: input.userId,
      amount: input.amount,
      type: WalletTransactionType.ADMIN_CREDIT,
      remarks: input.remarks,
      createdById: actorId,
      auditAction: FinancialAuditAction.WALLET_CREDIT,
      auditActorId: actorId,
    });
    return walletLedgerService.mapWalletSummary(result.wallet);
  }

  async debit(input: AdminWalletAdjustInput, actorId: string) {
    const result = await walletLedgerService.debitWallet({
      userId: input.userId,
      amount: input.amount,
      type: WalletTransactionType.ADMIN_DEBIT,
      remarks: input.remarks,
      createdById: actorId,
      auditAction: FinancialAuditAction.WALLET_DEBIT,
      auditActorId: actorId,
    });
    return walletLedgerService.mapWalletSummary(result.wallet);
  }
}

export const adminWalletsService = new AdminWalletsService();
