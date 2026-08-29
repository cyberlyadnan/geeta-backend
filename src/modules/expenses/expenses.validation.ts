import { z } from 'zod';
import { ExpensePaymentMode, ExpenseStatus } from '@prisma/client';

const money = z.coerce.number().min(0).max(99_999_999);

export const expenseIdParamSchema = z.object({ id: z.string().cuid() });

export const expenseListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categoryId: z.string().cuid().optional(),
  supplierId: z.string().cuid().optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  paymentMode: z.nativeEnum(ExpensePaymentMode).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const createExpenseSchema = z.object({
  categoryId: z.string().cuid(),
  expenseDate: z.coerce.date(),
  description: z.string().trim().min(2).max(500),
  payeeName: z.string().trim().max(160).optional(),
  supplierId: z.string().cuid().optional(),
  taxableAmount: money,
  /** Percent, e.g. 18 — not a fraction. The CGST/SGST/IGST split is computed server-side. */
  gstRate: z.coerce.number().min(0).max(50).default(0),
  /** Two-digit state code of the supplier, when it differs from the company's own state. */
  placeOfSupplyStateCode: z.string().regex(/^\d{2}$/).optional(),
  tdsAmount: money.default(0),
  inputCreditEligible: z.boolean().optional(),
  supplierGstin: z.string().trim().max(20).optional(),
  supplierInvoiceNumber: z.string().trim().max(60).optional(),
  supplierInvoiceDate: z.coerce.date().optional(),
  hsnCode: z.string().trim().max(12).optional(),
  paymentMode: z.nativeEnum(ExpensePaymentMode),
  paidFromAccountId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  attachmentUrl: z.string().url().max(600).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const expenseStatusSchema = z.object({
  status: z.nativeEnum(ExpenseStatus),
  notes: z.string().trim().max(500).optional(),
});

export const expenseCategoryListQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
});

export const createExpenseCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Z0-9_]+$/, 'Use uppercase letters, numbers and underscores'),
  name: z.string().trim().min(2).max(80),
  ledgerAccountCode: z.string().trim().min(3).max(10),
  parentId: z.string().cuid().optional(),
  inputCreditEligible: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateExpenseCategorySchema = createExpenseCategorySchema
  .partial()
  .omit({ code: true })
  .extend({ isActive: z.boolean().optional() });

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseStatusInput = z.infer<typeof expenseStatusSchema>;
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
