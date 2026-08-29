import { z } from 'zod';
import { ExpensePaymentMode, PurchaseBillStatus } from '@prisma/client';

const money = z.coerce.number().min(0).max(999_999_999);
const idParam = z.object({ id: z.string().cuid() });

export const purchaseIdParamSchema = idParam;

// ── Suppliers ────────────────────────────────────────────────────────────────

export const supplierListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  includeInactive: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().email().max(120).optional(),
  gstin: z.string().trim().max(20).optional(),
  pan: z.string().trim().max(12).optional(),
  address: z.string().trim().max(400).optional(),
  city: z.string().trim().max(60).optional(),
  state: z.string().trim().max(60).optional(),
  stateCode: z.string().regex(/^\d{2}$/).optional(),
  pincode: z.string().trim().max(10).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0),
  openingBalance: money.default(0),
  notes: z.string().trim().max(600).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ── Purchase bills ───────────────────────────────────────────────────────────

export const purchaseBillItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  hsnCode: z.string().trim().max(12).optional(),
  materialId: z.string().cuid().optional(),
  quantity: z.coerce.number().min(0.001).max(9_999_999).default(1),
  uom: z.string().trim().max(12).optional(),
  unitPrice: money,
  discount: money.default(0),
  gstRate: z.coerce.number().min(0).max(50).default(0),
  /** Ledger account code the line should hit; defaults to Paper & Material Purchases. */
  expenseAccountCode: z.string().trim().max(10).optional(),
});

export const billListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  supplierId: z.string().cuid().optional(),
  status: z.nativeEnum(PurchaseBillStatus).optional(),
  /** Only bills with something still outstanding — the payables working list. */
  outstandingOnly: z.coerce.boolean().default(false),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const createPurchaseBillSchema = z.object({
  supplierId: z.string().cuid(),
  supplierBillNumber: z.string().trim().min(1).max(60),
  billDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  placeOfSupplyStateCode: z.string().regex(/^\d{2}$/).optional(),
  items: z.array(purchaseBillItemSchema).min(1).max(200),
  discount: money.default(0),
  roundOff: z.coerce.number().min(-99).max(99).default(0),
  inputCreditEligible: z.boolean().default(true),
  reverseCharge: z.boolean().default(false),
  attachmentUrl: z.string().url().max(600).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const cancelBillSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

// ── Supplier payments ────────────────────────────────────────────────────────

export const createSupplierPaymentSchema = z.object({
  supplierId: z.string().cuid(),
  paymentDate: z.coerce.date(),
  amount: money.refine((v) => v > 0, 'Payment amount must be greater than zero'),
  mode: z.nativeEnum(ExpensePaymentMode),
  fromAccountId: z.string().cuid(),
  referenceNumber: z.string().trim().max(60).optional(),
  tdsAmount: money.default(0),
  notes: z.string().trim().max(600).optional(),
  /** Which bills this payment settles. Leave empty to record it as an on-account advance. */
  allocations: z
    .array(z.object({ billId: z.string().cuid(), amount: money }))
    .max(100)
    .default([]),
});

export const paymentListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  supplierId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type BillListQuery = z.infer<typeof billListQuerySchema>;
export type CreatePurchaseBillInput = z.infer<typeof createPurchaseBillSchema>;
export type PurchaseBillItemInput = z.infer<typeof purchaseBillItemSchema>;
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
