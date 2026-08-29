import { z } from 'zod';
import { FinancialActorType } from '@prisma/client';

const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };

export const reportRangeSchema = z.object(dateRange);

export const trialBalanceQuerySchema = z.object({
  ...dateRange,
  includeZeroBalances: z.coerce.boolean().default(false),
});

export const profitLossQuerySchema = z.object({
  ...dateRange,
  /** Adds a prior-period column so the numbers have something to be compared against. */
  compare: z.enum(['none', 'previous-period', 'previous-year']).default('none'),
});

export const balanceSheetQuerySchema = z.object({
  asAt: z.coerce.date().optional(),
});

export const ageingQuerySchema = z.object({
  asAt: z.coerce.date().optional(),
  kind: z.enum(['receivable', 'payable']).default('receivable'),
});

export const partyStatementQuerySchema = z.object({
  ...dateRange,
  partyType: z.nativeEnum(FinancialActorType),
  partyId: z.string().min(1),
});

export const exportQuerySchema = z.object({
  ...dateRange,
  pack: z
    .enum(['ca-handover', 'gst-returns', 'financial-statements', 'day-book', 'ageing', 'tally'])
    .default('ca-handover'),
});

export type ReportRange = z.infer<typeof reportRangeSchema>;
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;
export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;
export type BalanceSheetQuery = z.infer<typeof balanceSheetQuerySchema>;
export type AgeingQuery = z.infer<typeof ageingQuerySchema>;
export type PartyStatementQuery = z.infer<typeof partyStatementQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
