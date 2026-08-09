import type { Prisma } from '@prisma/client';
import { PaymentStatus } from '@prisma/client';
import { walletConfig } from '../../config/wallet.js';
import { prisma } from '../../config/database.js';
import { walletRepository } from '../../repositories/wallet.repository.js';
import { walletLedgerService } from '../../services/ledger/index.js';
import { paymentsService } from '../payments/payments.service.js';
import { decimalToNumber } from '../../utils/money.js';
import type { AddMoneyInput, ListTransactionsQuery } from './wallet.validation.js';

export class WalletService {
  getRechargeLimits() {
    return {
      min: walletConfig.minRechargeAmount,
      max: walletConfig.maxRechargeAmount,
    };
  }

  async getWallet(userId: string) {
    const wallet = await walletLedgerService.ensureWallet(userId);
    return walletLedgerService.mapWalletSummary(wallet);
  }

  async getSummary(userId: string) {
    const wallet = await walletRepository.ensureByUserId(userId);
    const summary = walletLedgerService.mapWalletSummary(wallet);

    const [pendingPayments, successfulPayments, recentTransactions] = await Promise.all([
      prisma.payment.count({
        where: {
          userId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
      }),
      prisma.payment.count({
        where: { userId, status: PaymentStatus.SUCCESS },
      }),
      prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      ...summary,
      rechargeLimits: this.getRechargeLimits(),
      pendingPayments,
      successfulPayments,
      recentActivity: recentTransactions.map((t) => this.mapTransaction(t)),
    };
  }

  async listTransactions(userId: string, query: ListTransactionsQuery) {
    const { page, limit, search, type, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WalletTransactionWhereInput = {
      userId,
      ...(type && { type }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
      ...(search && {
        OR: [
          { referenceNumber: { contains: search, mode: 'insensitive' } },
          { remarks: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Joining the order so the row can link straight to it — an amendment "±₹X · Amendment on
        // order ORD-1234" is meaningless without a way to see what actually changed.
        include: {
          productionOrder: { select: { id: true, orderNumber: true } },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    return {
      items: items.map((t) => this.mapTransaction(t)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async addMoney(userId: string, input: AddMoneyInput) {
    return paymentsService.createRechargePayment(userId, input);
  }

  private mapTransaction(t: {
    id: string;
    type: string;
    status: string;
    amount: import('@prisma/client').Prisma.Decimal;
    balanceBefore: import('@prisma/client').Prisma.Decimal;
    balanceAfter: import('@prisma/client').Prisma.Decimal;
    referenceNumber: string | null;
    reference: string | null;
    remarks: string | null;
    description: string | null;
    paymentMethod: string | null;
    paymentId: string | null;
    productionOrder?: { id: string; orderNumber: string } | null;
    createdAt: Date;
  }) {
    return {
      id: t.id,
      transactionType: t.type,
      status: t.status,
      amount: decimalToNumber(t.amount),
      balanceBefore: decimalToNumber(t.balanceBefore),
      balanceAfter: decimalToNumber(t.balanceAfter),
      referenceNumber: t.referenceNumber ?? t.reference,
      paymentId: t.paymentId,
      remarks: t.remarks ?? t.description,
      paymentMethod: t.paymentMethod,
      // The reference number "AMD-<id>" is enough for the API to recognise an amendment; the
      // client uses this to render an "Amendment" badge and a link to the order.
      isAmendment: (t.referenceNumber ?? '').startsWith('AMD-'),
      relatedOrder: t.productionOrder
        ? { id: t.productionOrder.id, orderNumber: t.productionOrder.orderNumber }
        : null,
      createdAt: t.createdAt.toISOString(),
    };
  }
}

export const walletService = new WalletService();
