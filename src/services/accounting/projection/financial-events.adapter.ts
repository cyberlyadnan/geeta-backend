import { JournalSourceType, type FinancialEvent } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import type { PostingLineInput } from '../posting.service.js';
import { resolveDefaultCashAccountCode } from '../cash-account.resolver.js';
import { emptyOutcome, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow, type EntryPlan } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';
import { resolveActorNames } from './actor-names.js';

/**
 * Maps the existing FinancialEvent ledger — the wallet and Udhar world Phase 2 built — into double
 * entry.
 *
 * The mapping worth understanding is the one for an order payment. Taking a customer's money when
 * they place an order is **not** revenue: the job has not been delivered and the invoice has not
 * been raised. So the money moves from one liability (their wallet balance) to another (an advance
 * against an unbilled order), and only the invoice at dispatch turns it into income. Getting this
 * wrong is the single most common way a printing business overstates its profit.
 */

type EventKind = FinancialEvent['eventType'];

const SOURCE_TYPE_BY_EVENT: Record<EventKind, JournalSourceType> = {
  ORDER_PLACEMENT_DEBIT: JournalSourceType.ORDER_ADVANCE,
  AMENDMENT_DEBIT: JournalSourceType.ORDER_ADVANCE,
  AMENDMENT_CREDIT: JournalSourceType.ORDER_ADVANCE,
  DELIVERY_CHARGE_DEBIT: JournalSourceType.ORDER_ADVANCE,
  WALLET_TOPUP: JournalSourceType.WALLET_TOPUP,
  WALLET_ADMIN_CREDIT: JournalSourceType.WALLET_ADJUSTMENT,
  WALLET_ADMIN_DEBIT: JournalSourceType.WALLET_ADJUSTMENT,
  UDHAR_DRAW: JournalSourceType.UDHAR_DRAW,
  UDHAR_REPAYMENT: JournalSourceType.UDHAR_REPAYMENT,
  REFUND_CREDIT: JournalSourceType.REFUND_PAYOUT,
};

const NARRATION: Record<EventKind, string> = {
  ORDER_PLACEMENT_DEBIT: 'Order payment received against unbilled order',
  AMENDMENT_DEBIT: 'Additional charge on order amendment',
  AMENDMENT_CREDIT: 'Refund to wallet on order amendment',
  DELIVERY_CHARGE_DEBIT: 'Delivery charge collected',
  WALLET_TOPUP: 'Wallet top-up received',
  WALLET_ADMIN_CREDIT: 'Promotional / goodwill wallet credit issued',
  WALLET_ADMIN_DEBIT: 'Wallet balance adjusted down by admin',
  UDHAR_DRAW: 'Credit (Udhar) drawn by customer',
  UDHAR_REPAYMENT: 'Credit (Udhar) repayment received',
  REFUND_CREDIT: 'Refund credited to customer wallet',
};

/** The customer-side account a wallet or Udhar movement touches. */
function instrumentAccount(event: FinancialEvent): string {
  return event.instrument === 'UDHAR'
    ? ACCOUNT_CODES.UDHAR_RECEIVABLE
    : ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY;
}

async function buildLines(event: FinancialEvent): Promise<PostingLineInput[]> {
  const amount = toNumber(event.amount);
  const party = { partyType: event.actorType, partyId: event.actorId };
  const ref = { referenceType: event.referenceType, referenceId: event.referenceId };

  switch (event.eventType) {
    /** Gateway holds the cash; the customer's wallet balance is now the business's liability. */
    case 'WALLET_TOPUP':
      return [
        { accountCode: ACCOUNT_CODES.PAYMENT_GATEWAY_RECEIVABLE, debit: amount, ...ref },
        { accountCode: ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY, credit: amount, ...party, ...ref },
      ];

    /** A giveaway: the business books a marketing cost and owes the customer the balance. */
    case 'WALLET_ADMIN_CREDIT':
      return [
        { accountCode: ACCOUNT_CODES.CUSTOMER_INCENTIVES, debit: amount, ...ref },
        { accountCode: ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY, credit: amount, ...party, ...ref },
      ];

    /** Clawback of a wallet balance — the liability falls, the gain is other income. */
    case 'WALLET_ADMIN_DEBIT':
      return [
        { accountCode: ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY, debit: amount, ...party, ...ref },
        { accountCode: ACCOUNT_CODES.OTHER_INCOME, credit: amount, ...ref },
      ];

    /** Wallet/Udhar → advance against an unbilled order. Not revenue yet. */
    case 'ORDER_PLACEMENT_DEBIT':
    case 'AMENDMENT_DEBIT':
    case 'DELIVERY_CHARGE_DEBIT':
      return [
        { accountCode: instrumentAccount(event), debit: amount, ...party, ...ref },
        { accountCode: ACCOUNT_CODES.CUSTOMER_ADVANCES, credit: amount, ...party, ...ref },
      ];

    /** The reverse: an advance given back to the customer's wallet. */
    case 'AMENDMENT_CREDIT':
      return [
        { accountCode: ACCOUNT_CODES.CUSTOMER_ADVANCES, debit: amount, ...party, ...ref },
        { accountCode: instrumentAccount(event), credit: amount, ...party, ...ref },
      ];

    /** Money lent to the customer, held as an advance against their order. */
    case 'UDHAR_DRAW':
      return [
        { accountCode: ACCOUNT_CODES.UDHAR_RECEIVABLE, debit: amount, ...party, ...ref },
        { accountCode: ACCOUNT_CODES.CUSTOMER_ADVANCES, credit: amount, ...party, ...ref },
      ];

    /**
     * A refund paid back into the customer's wallet. This settles the receivable the credit note
     * created — it is not a promotional giveaway, which is why it does not touch the incentives
     * expense account the way WALLET_ADMIN_CREDIT does.
     */
    case 'REFUND_CREDIT':
      return [
        { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: amount, ...party, ...ref },
        { accountCode: ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY, credit: amount, ...party, ...ref },
      ];

    /** Cash comes in, the receivable falls. */
    case 'UDHAR_REPAYMENT':
      return [
        { accountCode: await resolveDefaultCashAccountCode(), debit: amount, ...ref },
        { accountCode: ACCOUNT_CODES.UDHAR_RECEIVABLE, credit: amount, ...party, ...ref },
      ];

    default: {
      // Exhaustiveness guard: a new FinancialEventType added later fails loudly here rather than
      // silently vanishing from the books.
      const never: never = event.eventType;
      throw new Error(`No posting rule for financial event type "${String(never)}"`);
    }
  }
}

export const financialEventsAdapter: ProjectionAdapter = {
  name: 'financial-events',
  sourceTypes: [
    JournalSourceType.ORDER_ADVANCE,
    JournalSourceType.WALLET_TOPUP,
    JournalSourceType.WALLET_ADJUSTMENT,
    JournalSourceType.UDHAR_DRAW,
    JournalSourceType.UDHAR_REPAYMENT,
  ],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('financial-events');

    const events = await prisma.financialEvent.findMany({
      where: window.since ? { createdAt: { gte: window.since } } : {},
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
    });
    outcome.scanned = events.length;
    if (events.length === 0) return outcome;

    // Group by target source type so the "already posted" probe is one query per type, not per row.
    const byType = new Map<JournalSourceType, FinancialEvent[]>();
    for (const event of events) {
      const type = SOURCE_TYPE_BY_EVENT[event.eventType];
      byType.set(type, [...(byType.get(type) ?? []), event]);
    }

    const pending: FinancialEvent[] = [];
    for (const [sourceType, group] of byType) {
      const posted = await findPostedKeys(sourceType, group.map((e) => e.id));
      for (const event of group) {
        if (posted.has(event.id)) outcome.skipped += 1;
        else pending.push(event);
      }
    }
    if (pending.length === 0) return outcome;

    const names = await resolveActorNames(pending.map((e) => ({ actorType: e.actorType, actorId: e.actorId })));

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];
    for (const event of pending) {
      plans.push({
        sourceId: event.id,
        plans: [
          {
            entryDate: event.createdAt,
            sourceType: SOURCE_TYPE_BY_EVENT[event.eventType],
            sourceId: event.id,
            sourceKey: event.id,
            narration: `${NARRATION[event.eventType]} (${event.referenceType} ${event.referenceId})`,
            partyType: event.actorType,
            partyId: event.actorId,
            partyName: names.get(`${event.actorType}:${event.actorId}`) ?? null,
            createdByUserId: event.createdByUserId,
            metadata: { financialEventId: event.id, eventType: event.eventType },
            lines: await buildLines(event),
          },
        ],
      });
    }

    return postPlans(outcome, plans);
  },
};
