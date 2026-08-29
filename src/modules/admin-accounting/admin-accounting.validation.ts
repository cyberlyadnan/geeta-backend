import { z } from 'zod';
import { AccountSubType, AccountType, FiscalPeriodStatus, JournalSourceType } from '@prisma/client';

export const accountingIdParamSchema = z.object({ id: z.string().cuid() });

const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };

// ── Chart of accounts ────────────────────────────────────────────────────────

export const chartQuerySchema = z.object({
  type: z.nativeEnum(AccountType).optional(),
  includeInactive: z.coerce.boolean().default(false),
  /** Include each account's current balance — one extra aggregate, so it is opt-in. */
  withBalances: z.coerce.boolean().default(false),
  asAt: z.coerce.date().optional(),
});

export const createAccountSchema = z.object({
  code: z.string().trim().min(3).max(10).regex(/^\d{3,10}$/, 'Account codes are numeric'),
  name: z.string().trim().min(2).max(100),
  type: z.nativeEnum(AccountType),
  subType: z.nativeEnum(AccountSubType),
  parentCode: z.string().trim().max(10).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

// ── Day book & journal ───────────────────────────────────────────────────────

export const dayBookQuerySchema = z.object({
  ...dateRange,
  sourceType: z.nativeEnum(JournalSourceType).optional(),
  accountId: z.string().cuid().optional(),
  partyId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const accountLedgerQuerySchema = z.object({
  ...dateRange,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const manualJournalSchema = z.object({
  entryDate: z.coerce.date(),
  narration: z.string().trim().min(3).max(500),
  lines: z
    .array(
      z.object({
        accountCode: z.string().trim().min(3).max(10),
        debit: z.coerce.number().min(0).max(999_999_999).default(0),
        credit: z.coerce.number().min(0).max(999_999_999).default(0),
        description: z.string().trim().max(300).optional(),
      }),
    )
    .min(2)
    .max(60),
  /** Super admins only — lets a correction land in a period that has been soft-closed. */
  allowClosedPeriod: z.boolean().default(false),
});

export const reverseEntrySchema = z.object({
  reason: z.string().trim().min(3).max(300),
  reversalDate: z.coerce.date().optional(),
});

// ── Periods ──────────────────────────────────────────────────────────────────

export const periodStatusSchema = z.object({
  status: z.nativeEnum(FiscalPeriodStatus),
  notes: z.string().trim().max(500).optional(),
});

// ── Settings & projection ────────────────────────────────────────────────────

export const financeSettingsSchema = z.object({
  homeStateCode: z.string().regex(/^\d{2}$/).optional(),
  defaultGstRatePercent: z.coerce.number().min(0).max(50).optional(),
  defaultHsnCode: z.string().trim().max(12).optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  autoPostingEnabled: z.boolean().optional(),
  b2clThreshold: z.coerce.number().min(0).max(100_000_000).optional(),
  booksBeginFrom: z.coerce.date().nullable().optional(),
  enableTds: z.boolean().optional(),
  defaultTdsRatePercent: z.coerce.number().min(0).max(30).optional(),
});

export const runProjectionSchema = z.object({
  since: z.coerce.date().optional(),
  adapters: z.array(z.string().min(1).max(40)).max(12).optional(),
  batchSize: z.coerce.number().int().min(1).max(5000).default(1000),
});

export type ChartQuery = z.infer<typeof chartQuerySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type DayBookQueryInput = z.infer<typeof dayBookQuerySchema>;
export type AccountLedgerQuery = z.infer<typeof accountLedgerQuerySchema>;
export type ManualJournalInput = z.infer<typeof manualJournalSchema>;
export type ReverseEntryInput = z.infer<typeof reverseEntrySchema>;
export type FinanceSettingsInput = z.infer<typeof financeSettingsSchema>;
export type RunProjectionInput = z.infer<typeof runProjectionSchema>;
