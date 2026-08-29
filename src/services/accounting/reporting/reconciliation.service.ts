import { JournalSourceType } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { normaliseRange, round2 } from './report.types.js';
import { trialBalanceService } from './trial-balance.service.js';

export interface ReconciliationCheck {
  key: string;
  label: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  expected: number;
  actual: number;
  difference: number;
  detail: string;
}

export interface ReconciliationReport {
  range: { from: string; to: string };
  checks: ReconciliationCheck[];
  unpostedDocuments: { source: string; count: number }[];
  overallStatus: 'OK' | 'WARNING' | 'ERROR';
}

function check(
  key: string,
  label: string,
  expected: number,
  actual: number,
  detail: string,
  warnOnly = false,
): ReconciliationCheck {
  const difference = round2(expected - actual);
  const ok = Math.abs(difference) < 0.05;
  return {
    key,
    label,
    status: ok ? 'OK' : warnOnly ? 'WARNING' : 'ERROR',
    expected: round2(expected),
    actual: round2(actual),
    difference,
    detail,
  };
}

/**
 * The self-audit screen.
 *
 * Every derived system needs a way to prove it is still telling the truth, and this is it: the
 * books are checked back against the operational tables they were derived from. If invoices worth
 * ₹4.2 lakh were raised and only ₹3.9 lakh of revenue was posted, this says so — with the count of
 * documents still waiting to be projected, which is almost always the explanation.
 *
 * An owner should be able to look at this page before handing anything to their CA and see all
 * green.
 */
export class ReconciliationService {
  async build(options: { from?: Date; to?: Date }): Promise<ReconciliationReport> {
    const range = normaliseRange(options.from, options.to);
    const dateFilter = { gte: range.from, lte: range.to };

    const [invoiceAgg, receiptAgg, expenseAgg, billAgg, trialBalance] = await Promise.all([
      prisma.invoice.aggregate({ where: { createdAt: dateFilter }, _sum: { total: true, gstAmount: true }, _count: { _all: true } }),
      prisma.orderPaymentReceipt.aggregate({ where: { createdAt: dateFilter }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.aggregate({ where: { expenseDate: dateFilter, status: { in: ['APPROVED', 'PAID'] } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      prisma.purchaseBill.aggregate({ where: { billDate: dateFilter, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: { _all: true } }),
      trialBalanceService.build({ from: range.from, to: range.to }),
    ]);

    const postedTotals = async (sourceType: JournalSourceType) => {
      const agg = await prisma.journalEntry.aggregate({
        where: { sourceType, entryDate: dateFilter, status: 'POSTED' },
        _sum: { totalDebit: true },
        _count: { _all: true },
      });
      return { amount: round2(Number(agg._sum.totalDebit ?? 0)), count: agg._count._all };
    };

    const [salesPosted, receiptsPosted, expensesPosted, billsPosted] = await Promise.all([
      postedTotals(JournalSourceType.SALES_INVOICE),
      postedTotals(JournalSourceType.COUNTER_RECEIPT),
      postedTotals(JournalSourceType.EXPENSE),
      postedTotals(JournalSourceType.PURCHASE_BILL),
    ]);

    const checks: ReconciliationCheck[] = [
      check(
        'trial_balance',
        'Trial balance is balanced',
        trialBalance.totals.debit,
        trialBalance.totals.credit,
        'Total debits must equal total credits. A difference here means something wrote to the ledger outside the posting service.',
      ),
      check(
        'invoices_posted',
        'Invoices posted to the ledger',
        Number(invoiceAgg._sum.total ?? 0),
        salesPosted.amount,
        `${invoiceAgg._count._all} invoices issued · ${salesPosted.count} posted. A gap usually means the projection has not caught up.`,
        true,
      ),
      check(
        'counter_receipts_posted',
        'Counter payments posted to the ledger',
        Number(receiptAgg._sum.amount ?? 0),
        receiptsPosted.amount,
        `${receiptAgg._count._all} counter receipts recorded · ${receiptsPosted.count} posted.`,
        true,
      ),
      check(
        'expenses_posted',
        'Expenses posted to the ledger',
        Number(expenseAgg._sum.totalAmount ?? 0),
        expensesPosted.amount,
        `${expenseAgg._count._all} approved expenses · ${expensesPosted.count} posted.`,
        true,
      ),
      check(
        'purchase_bills_posted',
        'Purchase bills posted to the ledger',
        Number(billAgg._sum.total ?? 0),
        billsPosted.amount,
        `${billAgg._count._all} bills recorded · ${billsPosted.count} posted.`,
        true,
      ),
    ];

    const unposted = [
      { source: 'Invoices', count: Math.max(0, invoiceAgg._count._all - salesPosted.count) },
      { source: 'Counter receipts', count: Math.max(0, receiptAgg._count._all - receiptsPosted.count) },
      { source: 'Expenses', count: Math.max(0, expenseAgg._count._all - expensesPosted.count) },
      { source: 'Purchase bills', count: Math.max(0, billAgg._count._all - billsPosted.count) },
    ].filter((row) => row.count > 0);

    const overallStatus: ReconciliationReport['overallStatus'] = checks.some((c) => c.status === 'ERROR')
      ? 'ERROR'
      : checks.some((c) => c.status === 'WARNING')
        ? 'WARNING'
        : 'OK';

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      checks,
      unpostedDocuments: unposted,
      overallStatus,
    };
  }
}

export const reconciliationService = new ReconciliationService();
