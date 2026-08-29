import { z } from 'zod';
import { BankTransactionDirection, BankTransactionStatus, CashBankAccountType } from '@prisma/client';

const money = z.coerce.number().min(0).max(999_999_999);

export const cashBankIdParamSchema = z.object({ id: z.string().cuid() });

export const createCashBankAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_-]+$/),
  type: z.nativeEnum(CashBankAccountType),
  bankName: z.string().trim().max(80).optional(),
  accountNumber: z.string().trim().max(40).optional(),
  ifsc: z.string().trim().max(15).optional(),
  branch: z.string().trim().max(80).optional(),
  upiId: z.string().trim().max(80).optional(),
  openingBalance: z.coerce.number().min(-999_999_999).max(999_999_999).default(0),
  openingBalanceAsOf: z.coerce.date().optional(),
  isDefaultCash: z.boolean().default(false),
  isDefaultBank: z.boolean().default(false),
});

export const updateCashBankAccountSchema = createCashBankAccountSchema
  .partial()
  .omit({ code: true, openingBalance: true, openingBalanceAsOf: true })
  .extend({ isActive: z.boolean().optional() });

export const bankTransactionListQuerySchema = z.object({
  accountId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  direction: z.nativeEnum(BankTransactionDirection).optional(),
  status: z.nativeEnum(BankTransactionStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const createBankTransactionSchema = z.object({
  accountId: z.string().cuid(),
  direction: z.nativeEnum(BankTransactionDirection),
  amount: money.refine((v) => v > 0, 'Amount must be greater than zero'),
  valueDate: z.coerce.date(),
  description: z.string().trim().min(2).max(300),
  counterparty: z.string().trim().max(120).optional(),
  /**
   * Which ledger account the other side of this movement belongs to. Without it the entry lands
   * in Suspense, which is visible on the reconciliation screen rather than silently wrong.
   */
  contraAccountCode: z.string().trim().max(10).optional(),
  statementRef: z.string().trim().max(60).optional(),
});

export const reconcileSchema = z.object({
  transactionIds: z.array(z.string().cuid()).min(1).max(500),
  statementDate: z.coerce.date(),
  statementBalance: z.coerce.number(),
});

export type CreateCashBankAccountInput = z.infer<typeof createCashBankAccountSchema>;
export type UpdateCashBankAccountInput = z.infer<typeof updateCashBankAccountSchema>;
export type BankTransactionListQuery = z.infer<typeof bankTransactionListQuerySchema>;
export type CreateBankTransactionInput = z.infer<typeof createBankTransactionSchema>;
export type ReconcileInput = z.infer<typeof reconcileSchema>;
