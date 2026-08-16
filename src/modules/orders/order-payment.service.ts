import { PaymentReceiptMethod, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { recordOrderEvent } from './order-events.service.js';

export type OrderPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID';

export interface RecordOrderPaymentInput {
  amount: number;
  method: PaymentReceiptMethod;
  notes?: string;
}

/**
 * Staff-recorded payments against an order (cash/UPI/card taken at the counter). Deliberately
 * append-only — amountPaid/outstanding/paymentStatus are always derived by summing receipts
 * rather than cached on ProductionOrder, so a crashed request or a double-submit can never leave
 * the order's totals out of sync with its actual payment history.
 */
export class OrderPaymentService {
  async recordPayment(orderId: string, actorId: string, input: RecordOrderPaymentInput) {
    if (input.amount <= 0) {
      throw ApiError.badRequest('Payment amount must be greater than zero');
    }

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, totalAmount: true },
    });
    if (!order) throw ApiError.notFound('Order not found');

    const existingPaid = await this.sumPaid(orderId);
    const outstandingBefore = order.totalAmount.toNumber() - existingPaid;
    if (input.amount - outstandingBefore > 0.01) {
      throw ApiError.badRequest(
        `Payment of ${input.amount} exceeds the outstanding balance of ${outstandingBefore.toFixed(2)}`,
      );
    }

    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.orderPaymentReceipt.create({
        data: {
          orderId,
          amount: input.amount,
          method: input.method,
          notes: input.notes,
          recordedById: actorId,
        },
      });

      await recordOrderEvent(
        orderId,
        {
          eventType: 'PAYMENT_RECORDED',
          title: 'Payment recorded',
          description: `${input.method} payment of ₹${input.amount.toFixed(2)} recorded`,
          metadata: { receiptId: created.id, amount: input.amount, method: input.method },
          actorId,
        },
        tx,
      );

      return created;
    });

    return { receipt, summary: await this.getPaymentSummary(orderId) };
  }

  async getPaymentSummary(orderId: string) {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, totalAmount: true },
    });
    if (!order) throw ApiError.notFound('Order not found');

    const receipts = await prisma.orderPaymentReceipt.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: { recordedBy: { select: { id: true, firstName: true, lastName: true } } },
    });

    const totalAmount = order.totalAmount.toNumber();
    const amountPaid = receipts.reduce((sum, r) => sum + r.amount.toNumber(), 0);
    const outstanding = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);

    let paymentStatus: OrderPaymentStatus = 'UNPAID';
    if (amountPaid > 0 && outstanding <= 0.01) paymentStatus = 'FULLY_PAID';
    else if (amountPaid > 0) paymentStatus = 'PARTIALLY_PAID';

    return {
      orderId,
      totalAmount,
      amountPaid,
      outstanding,
      paymentStatus,
      receipts: receipts.map((r) => ({
        id: r.id,
        amount: r.amount.toNumber(),
        method: r.method,
        notes: r.notes,
        createdAt: r.createdAt,
        recordedBy: r.recordedBy
          ? { id: r.recordedBy.id, name: `${r.recordedBy.firstName} ${r.recordedBy.lastName}` }
          : null,
      })),
    };
  }

  private async sumPaid(orderId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const db = tx ?? prisma;
    const agg = await db.orderPaymentReceipt.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });
    return agg._sum.amount?.toNumber() ?? 0;
  }
}

export const orderPaymentService = new OrderPaymentService();
