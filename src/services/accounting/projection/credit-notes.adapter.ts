import { CreditNoteStatus, JournalSourceType, RefundMode } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import { resolveAccountCode, resolveDefaultCashAccountCode } from '../cash-account.resolver.js';
import type { PostingLineInput } from '../posting.service.js';
import { emptyOutcome, type EntryPlan, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';

/**
 * Credit notes and refunds.
 *
 * A refund is two distinct facts and the books must record both: the sale was reduced (a credit
 * note, which reverses the GST the business owes on it) and money went back to the customer (or
 * did not, if it was adjusted against their wallet or their Udhar). Businesses that record only
 * the payout end up paying GST on revenue they refunded.
 *
 *   CREDIT_NOTE   — Dr Sales Returns + Dr Output GST reversal, Cr Accounts Receivable
 *   REFUND_PAYOUT — Dr Accounts Receivable, Cr wherever the money actually went
 *
 * Where refundMode is CREDIT_ADJUSTMENT or ADJUST_AGAINST_FUTURE nothing leaves the business, so
 * the second entry credits the Udhar receivable or the customer-advance liability instead of cash.
 */
export const creditNotesAdapter: ProjectionAdapter = {
  name: 'credit-notes',
  sourceTypes: [JournalSourceType.CREDIT_NOTE, JournalSourceType.REFUND_PAYOUT],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('credit-notes');

    const notes = await prisma.creditNote.findMany({
      where: {
        status: CreditNoteStatus.ISSUED,
        ...(window.since ? { createdAt: { gte: window.since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: { invoice: { select: { invoiceNumber: true } } },
    });
    outcome.scanned = notes.length;
    if (notes.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.CREDIT_NOTE, notes.map((n) => n.id));
    const pending = notes.filter((n) => !posted.has(n.id));
    outcome.skipped += notes.length - pending.length;

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];

    for (const note of pending) {
      const taxable = toNumber(note.taxableValue);
      const cgst = toNumber(note.cgstAmount);
      const sgst = toNumber(note.sgstAmount);
      const igst = toNumber(note.igstAmount);
      const total = toNumber(note.total);
      const party = { partyType: note.actorType, partyId: note.actorId };
      const ref = { referenceType: 'CREDIT_NOTE', referenceId: note.id };

      const reversalLines: PostingLineInput[] = [
        {
          accountCode: ACCOUNT_CODES.SALES_RETURNS_AND_ALLOWANCES,
          debit: taxable,
          description: `Credit note ${note.creditNoteNumber}`,
          taxableValue: taxable,
          taxRate: toNumber(note.gstRate),
          ...ref,
        },
      ];
      if (cgst > 0) reversalLines.push({ accountCode: ACCOUNT_CODES.OUTPUT_CGST, debit: cgst, description: 'CGST reversed', ...ref });
      if (sgst > 0) reversalLines.push({ accountCode: ACCOUNT_CODES.OUTPUT_SGST, debit: sgst, description: 'SGST reversed', ...ref });
      if (igst > 0) reversalLines.push({ accountCode: ACCOUNT_CODES.OUTPUT_IGST, debit: igst, description: 'IGST reversed', ...ref });
      reversalLines.push({
        accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        credit: total,
        description: `Credit to ${note.billedToName}`,
        ...party,
        ...ref,
      });

      const entries: EntryPlan[] = [
        {
          entryDate: note.noteDate,
          sourceType: JournalSourceType.CREDIT_NOTE,
          sourceId: note.id,
          sourceKey: note.id,
          narration: `Credit note ${note.creditNoteNumber}${note.invoice ? ` against ${note.invoice.invoiceNumber}` : ''} — ${note.reason}`,
          ...party,
          partyName: note.billedToName,
          createdByUserId: note.createdById,
          metadata: { creditNoteNumber: note.creditNoteNumber, reason: note.reason },
          lines: reversalLines,
        },
      ];

      // A wallet refund is settled by the wallet ledger's own REFUND_CREDIT event, which the
      // financial-events adapter posts. Posting a second settlement here would credit the wallet
      // liability twice for one refund.
      const settledByWalletLedger = note.refundMode === RefundMode.WALLET;
      const settlementCode = await settlementAccountFor(note.refundMode, note.refundedFromAccountId);
      if (!settledByWalletLedger) entries.push({
        entryDate: note.refundedAt ?? note.noteDate,
        sourceType: JournalSourceType.REFUND_PAYOUT,
        sourceId: note.id,
        sourceKey: `${note.id}:payout`,
        narration: `Refund settlement for ${note.creditNoteNumber} via ${note.refundMode}`,
        ...party,
        partyName: note.billedToName,
        createdByUserId: note.createdById,
        metadata: { creditNoteNumber: note.creditNoteNumber, refundMode: note.refundMode },
        lines: [
          {
            accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
            debit: total,
            description: `Settlement of ${note.creditNoteNumber}`,
            ...party,
            ...ref,
          },
          {
            accountCode: settlementCode,
            credit: total,
            description: `Refunded via ${note.refundMode}`,
            ...(settlementCode === ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY ||
            settlementCode === ACCOUNT_CODES.UDHAR_RECEIVABLE ||
            settlementCode === ACCOUNT_CODES.CUSTOMER_ADVANCES
              ? party
              : {}),
            ...ref,
          },
        ],
      });

      plans.push({ sourceId: note.id, plans: entries });
    }

    return postPlans(outcome, plans);
  },
};

async function settlementAccountFor(mode: RefundMode, accountId: string | null): Promise<string> {
  switch (mode) {
    case RefundMode.WALLET:
      return ACCOUNT_CODES.CUSTOMER_WALLET_LIABILITY;
    case RefundMode.CREDIT_ADJUSTMENT:
      return ACCOUNT_CODES.UDHAR_RECEIVABLE;
    case RefundMode.ADJUST_AGAINST_FUTURE:
      return ACCOUNT_CODES.CUSTOMER_ADVANCES;
    case RefundMode.CASH:
      return accountId ? resolveAccountCode(accountId) : resolveDefaultCashAccountCode();
    default:
      return resolveAccountCode(accountId);
  }
}
