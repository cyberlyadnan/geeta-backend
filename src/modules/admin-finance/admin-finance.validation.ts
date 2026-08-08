import { z } from 'zod';
import { FinancialActorType, FinancialEventType } from '@prisma/client';

const dateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const financeSummaryQuerySchema = z.object(dateRange);

export const gstReportQuerySchema = z.object({
  ...dateRange,
  actorType: z.nativeEnum(FinancialActorType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * The export deliberately has no page/limit — an accountant filing a return needs the whole
 * period, not the first page of it. The date range is what bounds the query.
 */
export const gstExportQuerySchema = z.object({
  ...dateRange,
  actorType: z.nativeEnum(FinancialActorType).optional(),
});

export const ledgerExportQuerySchema = z.object({
  ...dateRange,
  actorId: z.string().min(1).optional(),
  actorType: z.nativeEnum(FinancialActorType).optional(),
  eventType: z.nativeEnum(FinancialEventType).optional(),
});

export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;
export type GstReportQuery = z.infer<typeof gstReportQuerySchema>;
export type GstExportQuery = z.infer<typeof gstExportQuerySchema>;
export type LedgerExportQuery = z.infer<typeof ledgerExportQuerySchema>;
