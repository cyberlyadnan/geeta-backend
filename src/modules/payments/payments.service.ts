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
import { decimalToNumber, toDecimal } from '../../utils/money.js';
import type { CreatePaymentInput } from './payments.validation.js';

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
      if (err instanceof ApiError) throw err;
      throw ApiError.serviceUnavailable(
        'Could not create UPI QR. Verify Razorpay API keys and that QR codes are enabled on your Razorpay account.',
        'PAYMENT_QR_FAILED',
      );
    }
  }

  async getPaymentForUser(userId: string, paymentId: string) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw ApiError.notFound('Payment not found');
    return this.mapPayment(payment);
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
      if (
        eventType === 'payment.captured' ||
        eventType === 'qr_code.credited' ||
        eventType === 'payment_link.paid'
      ) {
        await this.handlePaymentSuccess(payload);
      } else if (eventType === 'payment.failed') {
        await this.handlePaymentFailed(payload);
      } else if (eventType === 'qr_code.closed' || eventType === 'payment_link.expired') {
        await this.handlePaymentExpired(payload);
      } else if (eventType === 'payment_link.cancelled') {
        await this.handlePaymentExpired(payload);
      }

      await prisma.paymentWebhookLog.update({
        where: { id: webhookLog.id },
        data: { processed: true },
      });

      return { duplicate: false, message: 'Webhook processed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook processing failed';
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
      payment_link?: { entity?: Record<string, unknown> };
    };
  }) {
    const paymentEntity = payload.payload?.payment?.entity;
    const qrEntity = payload.payload?.qr_code?.entity;
    const linkEntity = payload.payload?.payment_link?.entity;

    const razorpayPaymentId = paymentEntity?.['id'] as string | undefined;
    const razorpayQrId = (qrEntity?.['id'] ?? paymentEntity?.['qr_code_id']) as string | undefined;
    const razorpayPaymentLinkId = (linkEntity?.['id'] ??
      paymentEntity?.['payment_link_id']) as string | undefined;
    const notes = (paymentEntity?.['notes'] ??
      qrEntity?.['notes'] ??
      linkEntity?.['notes']) as Record<string, string> | undefined;
    const referenceId = notes?.['reference_id'];

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(razorpayPaymentId ? [{ razorpayPaymentId }] : []),
          ...(razorpayQrId ? [{ razorpayQrId }] : []),
          ...(razorpayPaymentLinkId ? [{ razorpayPaymentLinkId }] : []),
          ...(referenceId ? [{ id: referenceId }] : []),
        ],
      },
    });

    if (!payment) {
      throw ApiError.notFound('Payment record not found for webhook');
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      const locked = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (locked.status === PaymentStatus.SUCCESS) return;

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          webhookVerified: true,
          paidAt: new Date(),
          razorpayPaymentId: razorpayPaymentId ?? locked.razorpayPaymentId,
          razorpayQrId: razorpayQrId ?? locked.razorpayQrId,
        },
      });

      const existingTx = await tx.walletTransaction.findUnique({
        where: { paymentId: payment.id },
      });
      if (existingTx) return;

      await walletLedgerService.creditWallet(
        {
          userId: payment.userId,
          amount: decimalToNumber(payment.amount),
          type: WalletTransactionType.RECHARGE,
          paymentId: payment.id,
          remarks: 'Wallet recharge via UPI QR',
          paymentMethod: PaymentMethod.UPI_QR,
          auditAction: FinancialAuditAction.PAYMENT_WEBHOOK,
        },
        tx,
      );
    });
  }

  private async handlePaymentFailed(payload: {
    payload?: { payment?: { entity?: Record<string, unknown> } };
  }) {
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

    if (!payment || payment.status === PaymentStatus.SUCCESS) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
  }

  private async handlePaymentExpired(payload: {
    payload?: {
      qr_code?: { entity?: Record<string, unknown> };
      payment_link?: { entity?: Record<string, unknown> };
    };
  }) {
    const qrId = payload.payload?.qr_code?.entity?.['id'] as string | undefined;
    const linkId = payload.payload?.payment_link?.entity?.['id'] as string | undefined;
    const linkNotes = payload.payload?.payment_link?.entity?.['notes'] as
      | Record<string, string>
      | undefined;
    const referenceId = linkNotes?.['reference_id'];

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(qrId ? [{ razorpayQrId: qrId }] : []),
          ...(linkId ? [{ razorpayPaymentLinkId: linkId }] : []),
          ...(referenceId ? [{ id: referenceId }] : []),
        ],
      },
    });
    if (!payment || payment.status === PaymentStatus.SUCCESS) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.EXPIRED },
    });
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
