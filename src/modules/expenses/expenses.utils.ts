import type { ExpenseDto, ExpenseWithRelations } from './expenses.types.js';

const n = (value: { toNumber(): number }): number => value.toNumber();

export function mapExpenseToDto(
  expense: ExpenseWithRelations,
  voucherNumber: string | null = null,
): ExpenseDto {
  return {
    id: expense.id,
    expenseNumber: expense.expenseNumber,
    expenseDate: expense.expenseDate.toISOString(),
    categoryId: expense.categoryId,
    categoryName: expense.category.name,
    description: expense.description,
    payeeName: expense.payeeName,
    supplierId: expense.supplierId,
    supplierName: expense.supplier?.name ?? null,
    taxableAmount: n(expense.taxableAmount),
    gstRate: n(expense.gstRate),
    cgstAmount: n(expense.cgstAmount),
    sgstAmount: n(expense.sgstAmount),
    igstAmount: n(expense.igstAmount),
    tdsAmount: n(expense.tdsAmount),
    totalAmount: n(expense.totalAmount),
    inputCreditEligible: expense.inputCreditEligible,
    supplierGstin: expense.supplierGstin,
    supplierInvoiceNumber: expense.supplierInvoiceNumber,
    hsnCode: expense.hsnCode,
    paymentMode: expense.paymentMode,
    paidFromAccountId: expense.paidFromAccountId,
    paidFromAccountName: expense.paidFromAccount?.name ?? null,
    status: expense.status,
    departmentId: expense.departmentId,
    attachmentUrl: expense.attachmentUrl,
    notes: expense.notes,
    createdByName: expense.createdBy ? `${expense.createdBy.firstName} ${expense.createdBy.lastName}` : null,
    approvedByName: expense.approvedBy ? `${expense.approvedBy.firstName} ${expense.approvedBy.lastName}` : null,
    createdAt: expense.createdAt.toISOString(),
    voucherNumber,
  };
}
