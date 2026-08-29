import { JournalSourceType, PurchaseBillStatus } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ACCOUNT_CODES } from '../account-codes.js';
import { resolveAccountCode } from '../cash-account.resolver.js';
import type { PostingLineInput } from '../posting.service.js';
import { emptyOutcome, type EntryPlan, type ProjectionAdapter, type ProjectionOutcome, type ProjectionWindow } from './projection.types.js';
import { findPostedKeys, postPlans, toNumber } from './projection.utils.js';

/**
 * Supplier bills and the payments that settle them — the payables half of the books.
 *
 * A bill and its payment are separate events on purpose: the bill creates the liability on the day
 * the paper arrived, the payment discharges it on the day the money left. Anything else makes the
 * payables ageing meaningless, and payables ageing is how a printing business avoids running out
 * of paper credit.
 */
export const purchaseBillsAdapter: ProjectionAdapter = {
  name: 'purchase-bills',
  sourceTypes: [JournalSourceType.PURCHASE_BILL],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('purchase-bills');

    const bills = await prisma.purchaseBill.findMany({
      where: {
        status: { not: PurchaseBillStatus.DRAFT },
        ...(window.since ? { createdAt: { gte: window.since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: {
        supplier: { select: { id: true, name: true, ledgerAccount: { select: { code: true } } } },
        items: { orderBy: { lineNumber: 'asc' } },
      },
    });
    outcome.scanned = bills.length;
    if (bills.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.PURCHASE_BILL, bills.map((b) => b.id));
    const pending = bills.filter((b) => !posted.has(b.id) && b.status !== PurchaseBillStatus.CANCELLED);
    outcome.skipped += bills.length - pending.length;

    // Resolve the expense/COGS account each line hits, one query for the whole batch.
    const accountIds = [...new Set(pending.flatMap((b) => b.items.map((i) => i.expenseAccountId).filter(Boolean)))] as string[];
    const accounts = accountIds.length
      ? await prisma.chartOfAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, code: true } })
      : [];
    const codeById = new Map(accounts.map((a) => [a.id, a.code]));

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];

    for (const bill of pending) {
      const ref = { referenceType: 'PURCHASE_BILL', referenceId: bill.id };
      const lines: PostingLineInput[] = [];

      for (const item of bill.items) {
        lines.push({
          accountCode:
            (item.expenseAccountId ? codeById.get(item.expenseAccountId) : undefined) ??
            ACCOUNT_CODES.PURCHASE_PAPER_MATERIAL,
          debit: toNumber(item.taxableValue),
          description: item.description,
          supplierId: bill.supplierId,
          hsnCode: item.hsnCode,
          taxRate: toNumber(item.gstRate),
          taxableValue: toNumber(item.taxableValue),
          ...ref,
        });
      }

      // A bill with no itemisation still has to post — book it to the default material account.
      if (lines.length === 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.PURCHASE_PAPER_MATERIAL,
          debit: toNumber(bill.taxableValue),
          description: `Purchase ${bill.supplierBillNumber}`,
          supplierId: bill.supplierId,
          ...ref,
        });
      }

      const cgst = toNumber(bill.cgstAmount);
      const sgst = toNumber(bill.sgstAmount);
      const igst = toNumber(bill.igstAmount);

      if (bill.inputCreditEligible) {
        if (cgst > 0) lines.push({ accountCode: ACCOUNT_CODES.INPUT_CGST, debit: cgst, description: 'Input CGST', ...ref });
        if (sgst > 0) lines.push({ accountCode: ACCOUNT_CODES.INPUT_SGST, debit: sgst, description: 'Input SGST', ...ref });
        if (igst > 0) lines.push({ accountCode: ACCOUNT_CODES.INPUT_IGST, debit: igst, description: 'Input IGST', ...ref });
      } else if (cgst + sgst + igst > 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.INPUT_TAX_INELIGIBLE,
          debit: cgst + sgst + igst,
          description: 'Ineligible input tax written to cost',
          ...ref,
        });
      }

      const roundOff = toNumber(bill.roundOff);
      if (roundOff !== 0) {
        lines.push({
          accountCode: ACCOUNT_CODES.ROUNDING_DIFFERENCE,
          debit: roundOff > 0 ? roundOff : 0,
          credit: roundOff < 0 ? -roundOff : 0,
          description: 'Bill round-off',
          ...ref,
        });
      }

      lines.push({
        accountCode: bill.supplier.ledgerAccount?.code ?? ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        credit: toNumber(bill.total),
        description: `Payable to ${bill.supplier.name} · ${bill.supplierBillNumber}`,
        supplierId: bill.supplierId,
        ...ref,
      });

      plans.push({
        sourceId: bill.id,
        plans: [
          {
            entryDate: bill.billDate,
            sourceType: JournalSourceType.PURCHASE_BILL,
            sourceId: bill.id,
            sourceKey: bill.id,
            narration: `Purchase bill ${bill.supplierBillNumber} from ${bill.supplier.name}`,
            createdByUserId: bill.createdById,
            metadata: { billNumber: bill.billNumber, supplierBillNumber: bill.supplierBillNumber },
            lines,
          },
        ],
      });
    }

    return postPlans(outcome, plans);
  },
};

export const supplierPaymentsAdapter: ProjectionAdapter = {
  name: 'supplier-payments',
  sourceTypes: [JournalSourceType.SUPPLIER_PAYMENT],

  async run(window: ProjectionWindow): Promise<ProjectionOutcome> {
    const outcome = emptyOutcome('supplier-payments');

    const payments = await prisma.supplierPayment.findMany({
      where: window.since ? { createdAt: { gte: window.since } } : {},
      orderBy: { createdAt: 'asc' },
      take: window.batchSize,
      include: {
        supplier: { select: { id: true, name: true, ledgerAccount: { select: { code: true } } } },
      },
    });
    outcome.scanned = payments.length;
    if (payments.length === 0) return outcome;

    const posted = await findPostedKeys(JournalSourceType.SUPPLIER_PAYMENT, payments.map((p) => p.id));
    const pending = payments.filter((p) => !posted.has(p.id));
    outcome.skipped += payments.length - pending.length;

    const plans: { sourceId: string; plans: EntryPlan[] }[] = [];

    for (const payment of pending) {
      const amount = toNumber(payment.amount);
      const tds = toNumber(payment.tdsAmount);
      const ref = { referenceType: 'SUPPLIER_PAYMENT', referenceId: payment.id };
      const fromCode = await resolveAccountCode(payment.fromAccountId);

      plans.push({
        sourceId: payment.id,
        plans: [
          {
            entryDate: payment.paymentDate,
            sourceType: JournalSourceType.SUPPLIER_PAYMENT,
            sourceId: payment.id,
            sourceKey: payment.id,
            narration: `Payment ${payment.paymentNumber} to ${payment.supplier.name}`,
            createdByUserId: payment.createdById,
            metadata: { paymentNumber: payment.paymentNumber },
            lines: [
              {
                accountCode: payment.supplier.ledgerAccount?.code ?? ACCOUNT_CODES.ACCOUNTS_PAYABLE,
                debit: amount + tds,
                description: `Settled against ${payment.supplier.name}`,
                supplierId: payment.supplierId,
                ...ref,
              },
              ...(tds > 0
                ? [{ accountCode: ACCOUNT_CODES.TDS_PAYABLE, credit: tds, description: 'TDS withheld on payment', ...ref }]
                : []),
              { accountCode: fromCode, credit: amount, description: `Paid via ${payment.mode}`, ...ref },
            ],
          },
        ],
      });
    }

    return postPlans(outcome, plans);
  },
};
