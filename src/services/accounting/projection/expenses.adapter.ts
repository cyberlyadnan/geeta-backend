import { ExpenseStatus, JournalSourceType } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import { resolveCodeForPaymentMode } from '../cash-account.resolver.js';
import type { PostingLineInput } from '../posting.service.js';
import { emptyOutcome, type EntryPlan, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';

/**
 * Business spending.
 *
 * The GST treatment is the part that earns its keep: input tax is only an asset if the business
 * can actually claim it back. Where it cannot — a blocked credit, or an unregistered supplier —
 * the tax is folded into the cost rather than parked in the Input GST account, which is what stops
 * the GST reconciliation from carrying a balance that will never be recovered.
 *
 * Only APPROVED and PAID expenses post. A draft or rejected expense is not a business event.
 */
export const expensesAdapter: ProjectionAdapter = {
  name: 'expenses',
  sourceTypes: [JournalSourceType.EXPENSE],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('expenses');

    const expenses = await prisma.expense.findMany({
      where: {
        status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PAID] },
        ...(window.since ? { createdAt: { gte: window.since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: {
        category: { select: { name: true, ledgerAccount: { select: { code: true } } } },
        supplier: { select: { id: true, name: true } },
      },
    });
    outcome.scanned = expenses.length;
    if (expenses.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.EXPENSE, expenses.map((e) => e.id));
    const pending = expenses.filter((e) => !posted.has(e.id));
    outcome.skipped += expenses.length - pending.length;

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];

    for (const expense of pending) {
      const taxable = toNumber(expense.taxableAmount);
      const cgst = toNumber(expense.cgstAmount);
      const sgst = toNumber(expense.sgstAmount);
      const igst = toNumber(expense.igstAmount);
      const tds = toNumber(expense.tdsAmount);
      const total = toNumber(expense.totalAmount);
      const gstTotal = cgst + sgst + igst;
      const claimable = expense.inputCreditEligible;

      const ref = { referenceType: 'EXPENSE', referenceId: expense.id };
      const lines: PostingLineInput[] = [
        {
          accountCode: expense.category.ledgerAccount.code,
          // Non-claimable tax is part of the cost of the thing bought, not a receivable.
          debit: claimable ? taxable : taxable + gstTotal,
          description: expense.description,
          departmentId: expense.departmentId,
          supplierId: expense.supplierId,
          hsnCode: expense.hsnCode,
          taxRate: toNumber(expense.gstRate),
          taxableValue: taxable,
          ...ref,
        },
      ];

      if (claimable) {
        if (cgst > 0) lines.push({ accountCode: ACCOUNT_CODES.INPUT_CGST, debit: cgst, description: 'Input CGST', ...ref });
        if (sgst > 0) lines.push({ accountCode: ACCOUNT_CODES.INPUT_SGST, debit: sgst, description: 'Input SGST', ...ref });
        if (igst > 0) lines.push({ accountCode: ACCOUNT_CODES.INPUT_IGST, debit: igst, description: 'Input IGST', ...ref });
      }

      // TDS withheld is not paid to the payee — it is owed to the government.
      if (tds > 0) {
        lines.push({ accountCode: ACCOUNT_CODES.TDS_PAYABLE, credit: tds, description: 'TDS withheld', ...ref });
      }

      const creditCode = await resolveCodeForPaymentMode(expense.paymentMode, expense.paidFromAccountId);
      lines.push({
        accountCode: creditCode,
        credit: total - tds,
        description:
          expense.paymentMode === 'CREDIT'
            ? `Payable to ${expense.supplier?.name ?? expense.payeeName ?? 'supplier'}`
            : `Paid by ${expense.paymentMode.toLowerCase().replace('_', ' ')}`,
        supplierId: expense.paymentMode === 'CREDIT' ? expense.supplierId : null,
        ...ref,
      });

      plans.push({
        sourceId: expense.id,
        plans: [
          {
            entryDate: expense.expenseDate,
            sourceType: JournalSourceType.EXPENSE,
            sourceId: expense.id,
            sourceKey: expense.id,
            narration: `${expense.expenseNumber} · ${expense.category.name} · ${expense.description}`,
            createdByUserId: expense.createdById,
            metadata: {
              expenseNumber: expense.expenseNumber,
              payee: expense.supplier?.name ?? expense.payeeName ?? null,
            },
            lines,
          },
        ],
      });
    }

    return postPlans(outcome, plans);
  },
};
