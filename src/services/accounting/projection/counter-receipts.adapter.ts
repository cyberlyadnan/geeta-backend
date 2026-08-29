import { JournalSourceType, type PaymentReceiptMethod } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import { resolveDefaultBankAccountCode, resolveDefaultCashAccountCode } from '../cash-account.resolver.js';
import { emptyOutcome, type EntryPlan, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';

/**
 * Counter payments — the walk-in customer paying cash or scanning a UPI code at the shop.
 *
 * This is the gap that made the old finance screen untrustworthy: OrderPaymentReceipt rows never
 * reached the financial ledger at all, so every rupee taken over the counter was invisible to
 * finance while showing up correctly on the order. Projecting them fixes the cash position, the
 * P&L and the GST liability in one move.
 */

async function accountCodeForMethod(method: PaymentReceiptMethod): Promise<string> {
  switch (method) {
    case 'CASH':
      return resolveDefaultCashAccountCode();
    case 'UPI':
    case 'CARD':
    case 'BANK_TRANSFER':
      return resolveDefaultBankAccountCode();
    default:
      return resolveDefaultCashAccountCode();
  }
}

export const counterReceiptsAdapter: ProjectionAdapter = {
  name: 'counter-receipts',
  sourceTypes: [JournalSourceType.COUNTER_RECEIPT],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('counter-receipts');

    const receipts = await prisma.orderPaymentReceipt.findMany({
      where: window.since ? { createdAt: { gte: window.since } } : {},
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerId: true,
            retailCustomerId: true,
            customer: { select: { firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } } },
            retailCustomer: { select: { name: true } },
          },
        },
      },
    });
    outcome.scanned = receipts.length;
    if (receipts.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.COUNTER_RECEIPT, receipts.map((r) => r.id));
    const pending = receipts.filter((r) => !posted.has(r.id));
    outcome.skipped += receipts.length - pending.length;

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];
    for (const receipt of pending) {
      const amount = toNumber(receipt.amount);
      const order = receipt.order;
      const isVendor = Boolean(order.customerId);
      const partyType = isVendor ? ('VENDOR' as const) : ('RETAIL_CUSTOMER' as const);
      const partyId = isVendor ? order.customerId! : order.retailCustomerId!;
      const partyName = isVendor
        ? order.customer?.vendorProfile?.businessName ??
          `${order.customer?.firstName ?? ''} ${order.customer?.lastName ?? ''}`.trim()
        : (order.retailCustomer?.name ?? null);

      const cashCode = await accountCodeForMethod(receipt.method);

      plans.push({
        sourceId: receipt.id,
        plans: [
          {
            entryDate: receipt.createdAt,
            sourceType: JournalSourceType.COUNTER_RECEIPT,
            sourceId: receipt.id,
            sourceKey: receipt.id,
            narration: `${receipt.method} payment received at counter for order ${order.orderNumber}`,
            partyType,
            partyId,
            partyName: partyName || null,
            createdByUserId: receipt.recordedById,
            metadata: { orderId: order.id, method: receipt.method },
            lines: [
              {
                accountCode: cashCode,
                debit: amount,
                description: `Counter receipt · order ${order.orderNumber}`,
                referenceType: 'ORDER',
                referenceId: order.id,
              },
              {
                // Held as an advance until the order is invoiced at dispatch — same treatment as
                // a wallet-funded order, so retail and vendor sales reconcile identically.
                accountCode: ACCOUNT_CODES.CUSTOMER_ADVANCES,
                credit: amount,
                partyType,
                partyId,
                referenceType: 'ORDER',
                referenceId: order.id,
              },
            ],
          },
        ],
      });
    }

    return postPlans(outcome, plans);
  },
};
