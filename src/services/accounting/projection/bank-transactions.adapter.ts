import { BankTransactionStatus, JournalSourceType } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import { emptyOutcome, type EntryPlan, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';

/**
 * Manually-entered cash and bank movements: owner drawings, cash banked, bank charges, a gateway
 * settlement landing in the current account.
 *
 * Rows created *by* another posting (an expense payment, a supplier payment) already carry a
 * journalEntryId and are skipped — otherwise the same money would be counted twice. Only
 * standalone movements are projected here.
 */
export const bankTransactionsAdapter: ProjectionAdapter = {
  name: 'bank-transactions',
  sourceTypes: [JournalSourceType.BANK_TRANSACTION],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('bank-transactions');

    const rows = await prisma.bankTransaction.findMany({
      where: {
        status: { not: BankTransactionStatus.VOID },
        journalEntryId: null,
        // A row that mirrors another document's posting names it here; those are not standalone.
        referenceType: null,
        ...(window.since ? { createdAt: { gte: window.since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: { account: { select: { name: true, ledgerAccount: { select: { code: true } } } } },
    });
    outcome.scanned = rows.length;
    if (rows.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.BANK_TRANSACTION, rows.map((r) => r.id));
    const pending = rows.filter((r) => !posted.has(r.id));
    outcome.skipped += rows.length - pending.length;

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];

    for (const row of pending) {
      const amount = toNumber(row.amount);
      const bankCode = row.account.ledgerAccount.code;
      // Unclassified movements land in Suspense so they are visibly unfinished rather than
      // silently distorting a real account. The contra account can be corrected by a reversal.
      const contraCode =
        typeof row.metadata === 'object' && row.metadata !== null && 'contraAccountCode' in row.metadata
          ? String((row.metadata as Record<string, unknown>)['contraAccountCode'])
          : ACCOUNT_CODES.SUSPENSE;

      plans.push({
        sourceId: row.id,
        plans: [
          {
            entryDate: row.valueDate,
            sourceType: JournalSourceType.BANK_TRANSACTION,
            sourceId: row.id,
            sourceKey: row.id,
            narration: `${row.description} (${row.account.name})`,
            createdByUserId: row.createdById,
            metadata: { bankTransactionId: row.id, direction: row.direction },
            lines:
              row.direction === 'IN'
                ? [
                    { accountCode: bankCode, debit: amount, description: row.description },
                    { accountCode: contraCode, credit: amount, description: row.counterparty ?? row.description },
                  ]
                : [
                    { accountCode: contraCode, debit: amount, description: row.counterparty ?? row.description },
                    { accountCode: bankCode, credit: amount, description: row.description },
                  ],
          },
        ],
      });
    }

    return postPlans(outcome, plans);
  },
};
