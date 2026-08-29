import { z } from 'zod';
import { FinancialActorType } from '@prisma/client';

const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };

export const reportsIdParamSchema = z.object({ id: z.string().cuid() });

export const salesRegisterQuerySchema = z.object({
  ...dateRange,
  actorType: z.nativeEnum(FinancialActorType).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const collectionsQuerySchema = z.object({
  ...dateRange,
  groupBy: z.enum(['day', 'method', 'staff']).default('day'),
});

export const expenseSummaryQuerySchema = z.object({
  ...dateRange,
  groupBy: z.enum(['category', 'month', 'department', 'payee']).default('category'),
});

export type SalesRegisterQuery = z.infer<typeof salesRegisterQuerySchema>;
export type CollectionsQuery = z.infer<typeof collectionsQuerySchema>;
export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;
