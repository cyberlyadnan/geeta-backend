import {
  FinancialAuditAction,
  PaymentMethod,
  PaymentStatus,
  WalletTransactionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';
import { walletConfig } from '../../config/wallet.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { walletLedgerService } from '../../services/ledger/index.js';
import { razorpayService } from '../../services/razorpay/index.js';
import { mapRazorpayError } from '../../services/razorpay/razorpay.errors.js';
import { logger } from '../../logs/logger.js';
import { decimalToNumber, paiseFromRupees, toDecimal } from '../../utils/money.js';
import type { CreatePaymentInput } from './payments.validation.js';

/** Throttle Razorpay status sync per payment while the client polls */
const lastRazorpaySyncAttempt = new Map<string, number>();
const RAZORPAY_SYNC_INTERVAL_MS = 2_000;

export class PaymentsService {
  async createRechargePayment(userId: string, input: CreatePaymentInput) {
    const wallet = await walletLedgerService.ensureWallet(userId);
    const idempotencyKey = `wallet-${userId}-${randomUUID()}`;
    const expiryMs = Math.max(
      walletConfig.paymentExpiryMinutes * 60_000,
      20 * 60_000,
    );
    const expiresAt = new Date(Date.now() + expiryMs);

    const payment = await prisma.payment.create({
      data: {
        userId,
        walletId: wallet.id,
        amount: toDecimal(input.amount),
        status: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.UPI_QR,
        idempotencyKey,
        expiresAt,
        metadata: { purpose: 'wallet_recharge' },
      },
    });

    await prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYMENT_CREATED,
        targetUserId: userId,
        walletId: wallet.id,
        paymentId: payment.id,
        amount: payment.amount,
        remarks: `Recharge initiated for ₹${input.amount}`,
      },
    });

    try {
      const checkout = await razorpayService.createWalletRechargeCheckout({
        amountRupees: input.amount,
        referenceId: payment.id,
        description: `Geeta Print wallet recharge ₹${input.amount}`,
        expiresAt,
      });

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PROCESSING,
          expiresAt: checkout.expiresAt,
          razorpayQrId: checkout.razorpayId,
          qrImageUrl: checkout.qrImageUrl,
          qrReference: checkout.referenceId,
          metadata: {
            purpose: 'wallet_recharge',
            checkoutMode: checkout.checkoutMode,
          },
        },
      });

      return this.mapPayment(updated);
    } catch (err) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      logger.error('Wallet recharge QR creation failed', {
        paymentId: payment.id,
        userId,
        amount: input.amount,
        error: err instanceof ApiError ? err.message : String(err),
        code: err instanceof ApiError ? err.code : undefined,
        details: err instanceof ApiError ? err.details : undefined,
      });

      if (err instanceof ApiError) throw err;
      throw mapRazorpayError(err);
    }
  }

  async getPaymentForUser(userId: string, paymentId: string) {
    let payment = await prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw ApiError.notFound('Payment not found');

    if (
      payment.status === PaymentStatus.PENDING ||
      payment.status === PaymentStatus.PROCESSING
    ) {
      const synced = await this.syncPendingPaymentFromRazorpay(payment);
      if (synced) payment = synced;
    }

    const mapped = this.mapPayment(payment);

    if (payment.status === PaymentStatus.SUCCESS) {
      const wallet = await walletLedgerService.ensureWallet(userId);
      return {
        ...mapped,
        walletBalance: decimalToNumber(wallet.currentBalance),
      };
    }

    return mapped;
  }

  /**
   * Webhook fallback: reconcile pending QR payments directly with Razorpay so the
   * client sees SUCCESS without waiting for delayed webhook delivery.
   */
  private async syncPendingPaymentFromRazorpay(
    payment: {
      id: string;
      userId: string;
      status: PaymentStatus;
      razorpayQrId: string | null;
      amount: import('@prisma/client').Prisma.Decimal;
    },
  ) {
    if (!payment.razorpayQrId) return null;

    const now = Date.now();
    const lastAttempt = lastRazorpaySyncAttempt.get(payment.id) ?? 0;
    if (now - lastAttempt < RAZORPAY_SYNC_INTERVAL_MS) return null;
    lastRazorpaySyncAttempt.set(payment.id, now);

    const captured = await razorpayService.fetchQrCapturedPayment(payment.razorpayQrId);
    if (!captured) return null;

    const expectedPaise = paiseFromRupees(decimalToNumber(payment.amount));
    if (captured.amountPaise !== expectedPaise) {
      logger.error('Razorpay sync amount mismatch — wallet not credited', {
        paymentId: payment.id,
        expectedPaise,
        capturedPaise: captured.amountPaise,
      });
      return null;
    }

    await this.finalizeSuccessfulRecharge(
      payment.id,
      captured.razorpayPaymentId,
      payment.razorpayQrId,
      'Wallet recharge via UPI QR (status sync)',
    );

    lastRazorpaySyncAttempt.delete(payment.id);

    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  async processWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature) {
      throw ApiError.unauthorized('Missing Razorpay signature');
    }

    const valid = razorpayService.verifyWebhookSignature(rawBody, signature);
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      id?: string;
      payload?: {
        payment?: { entity?: Record<string, unknown> };
        qr_code?: { entity?: Record<string, unknown> };
        payment_link?: { entity?: Record<string, unknown> };
      };
    };

    const eventId = payload.id ?? `unknown-${Date.now()}`;
    const eventType = payload.event ?? 'unknown';

    const existingLog = await prisma.paymentWebhookLog.findUnique({
      where: { razorpayEventId: eventId },
    });
    if (existingLog?.processed) {
      return { duplicate: true, message: 'Event already processed' };
    }

    const webhookLog = await prisma.paymentWebhookLog.upsert({
      where: { razorpayEventId: eventId },
      create: {
        razorpayEventId: eventId,
        eventType,
        signatureValid: valid,
        payload: payload as object,
        processed: false,
      },
      update: {
        signatureValid: valid,
        payload: payload as object,
      },
    });

    if (!valid) {
      await prisma.paymentWebhookLog.update({
        where: { id: webhookLog.id },
        data: { processError: 'Invalid signature', processed: true },
      });
      throw ApiError.unauthorized('Invalid webhook signature');
    }

    try {
      let linkedPaymentId: string | undefined;

      if (
        eventType === 'payment.captured' ||
        eventType === 'qr_code.credited'
      ) {
        linkedPaymentId = await this.handlePaymentSuccess(payload);
      } else if (eventType === 'payment.failed') {
        linkedPaymentId = await this.handlePaymentFailed(payload);
      } else if (eventType === 'qr_code.closed') {
        linkedPaymentId = await this.handlePaymentExpired(payload);
      } else {
        logger.debug('Unhandled Razorpay webhook event', { eventType, eventId });
      }

      await prisma.paymentWebhookLog.update({
        where: { id: webhookLog.id },
        data: {
          processed: true,
          ...(linkedPaymentId ? { paymentId: linkedPaymentId } : {}),
        },
      });

      return { duplicate: false, message: 'Webhook processed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook processing failed';
      logger.error('Razorpay webhook processing failed', {
        eventId,
        eventType,
        error: message,
      });
      await prisma.paymentWebhookLog.update({
        where: { id: webhookLog.id },
        data: { processError: message, processed: false },
      });
      throw err;
    }
  }

  private async handlePaymentSuccess(payload: {
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      qr_code?: { entity?: Record<string, unknown> };
    };
  }): Promise<string | undefined> {
    const paymentEntity = payload.payload?.payment?.entity;
    const qrEntity = payload.payload?.qr_code?.entity;

    const razorpayPaymentId = paymentEntity?.['id'] as string | undefined;
    const razorpayQrId = (qrEntity?.['id'] ?? paymentEntity?.['qr_code_id']) as string | undefined;
    const notes = (paymentEntity?.['notes'] ?? qrEntity?.['notes']) as
      | Record<string, string>
      | undefined;
    const referenceId = notes?.['reference_id'];
    const capturedPaise = paymentEntity?.['amount'] as number | undefined;

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
          ...(razorpayQrId ? [{ razorpayQrId }] : []),
          ...(referenceId ? [{ id: referenceId }] : []),
        ],
      },
    });

    if (!payment) {
      throw ApiError.notFound('Payment record not found for webhook');
    }

    if (
      capturedPaise !== undefined &&
      capturedPaise !== paiseFromRupees(decimalToNumber(payment.amount))
    ) {
      logger.error('Webhook amount mismatch — wallet not credited', {
        paymentId: payment.id,
        expectedPaise: paiseFromRupees(decimalToNumber(payment.amount)),
        capturedPaise,
      });
      throw ApiError.badRequest('Payment amount mismatch');
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return payment.id;
    }

    await this.finalizeSuccessfulRecharge(
      payment.id,
      razorpayPaymentId,
      razorpayQrId,
      'Wallet recharge via UPI QR',
    );

    logger.info('Wallet credited via webhook', {
      paymentId: payment.id,
      userId: payment.userId,
      amount: decimalToNumber(payment.amount),
      razorpayPaymentId,
      razorpayQrId,
    });

    return payment.id;
  }

  private async finalizeSuccessfulRecharge(
    paymentId: string,
    razorpayPaymentId: string | undefined,
    razorpayQrId: string | undefined,
    creditRemarks: string,
  ) {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (locked.status === PaymentStatus.SUCCESS) return;

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.SUCCESS,
          webhookVerified: true,
          paidAt: new Date(),
          razorpayPaymentId: razorpayPaymentId ?? locked.razorpayPaymentId,
          razorpayQrId: razorpayQrId ?? locked.razorpayQrId,
        },
      });

      const existingTx = await tx.walletTransaction.findUnique({
        where: { paymentId },
      });
      if (existingTx) return;

      await walletLedgerService.creditWallet(
        {
          userId: locked.userId,
          amount: decimalToNumber(locked.amount),
          type: WalletTransactionType.RECHARGE,
          paymentId,
          remarks: creditRemarks,
          paymentMethod: PaymentMethod.UPI_QR,
          auditAction: FinancialAuditAction.PAYMENT_WEBHOOK,
        },
        tx,
      );
    });
  }

  private async handlePaymentFailed(payload: {
    payload?: { payment?: { entity?: Record<string, unknown> } };
  }): Promise<string | undefined> {
    const entity = payload.payload?.payment?.entity;
    const razorpayPaymentId = entity?.['id'] as string | undefined;
    const notes = entity?.['notes'] as Record<string, string> | undefined;

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
          ...(notes?.['reference_id'] ? [{ id: notes['reference_id'] }] : []),
        ],
      },
    });

    if (!payment || payment.status === PaymentStatus.SUCCESS) return undefined;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    return payment.id;
  }

  private async handlePaymentExpired(payload: {
    payload?: {
      qr_code?: { entity?: Record<string, unknown> };
    };
  }): Promise<string | undefined> {
    const qrId = payload.payload?.qr_code?.entity?.['id'] as string | undefined;
    const qrNotes = payload.payload?.qr_code?.entity?.['notes'] as
      | Record<string, string>
      | undefined;
    const referenceId = qrNotes?.['reference_id'];

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(qrId ? [{ razorpayQrId: qrId }] : []),
          ...(referenceId ? [{ id: referenceId }] : []),
        ],
      },
    });
    if (!payment || payment.status === PaymentStatus.SUCCESS) return undefined;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.EXPIRED },
    });

    return payment.id;
  }

  private mapPayment(payment: {
    id: string;
    userId: string;
    amount: import('@prisma/client').Prisma.Decimal;
    currency: string;
    status: PaymentStatus;
    paymentMethod: PaymentMethod;
    qrImageUrl: string | null;
    qrReference: string | null;
    expiresAt: Date | null;
    paidAt: Date | null;
    webhookVerified: boolean;
    metadata: import('@prisma/client').Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: payment.id,
      userId: payment.userId,
      amount: decimalToNumber(payment.amount),
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      checkoutMode: 'upi_qr' as const,
      qrImageUrl: payment.qrImageUrl,
      checkoutUrl: payment.qrImageUrl,
      qrReference: payment.qrReference,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      webhookVerified: payment.webhookVerified,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }
}

export const paymentsService = new PaymentsService();
