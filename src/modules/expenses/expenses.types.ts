import type { Expense, ExpenseCategory } from '@prisma/client';

export interface ExpenseDto {
  id: string;
  expenseNumber: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  description: string;
  payeeName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  tdsAmount: number;
  totalAmount: number;
  inputCreditEligible: boolean;
  supplierGstin: string | null;
  supplierInvoiceNumber: string | null;
  hsnCode: string | null;
  paymentMode: string;
  paidFromAccountId: string | null;
  paidFromAccountName: string | null;
  status: string;
  departmentId: string | null;
  attachmentUrl: string | null;
  notes: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  createdAt: string;
  /** Present once the projection has written this expense into the journal. */
  voucherNumber: string | null;
}

export type ExpenseWithRelations = Expense & {
  category: Pick<ExpenseCategory, 'id' | 'name'>;
  supplier: { name: string } | null;
  paidFromAccount: { name: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
};
