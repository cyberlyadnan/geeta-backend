import { z } from 'zod';
import { FinancialActorType, FinancialEventType } from '@prisma/client';

export const setCreditLimitSchema = z.object({
  creditLimit: z.coerce.number().min(0),
});

export const creditAccountIdParamSchema = z.object({
  id: z.string().min(1),
});

export const recordRepaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  note: z.string().max(2000).optional(),
});

export const listCreditTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listFinancialEventsQuerySchema = z.object({
  actorId: z.string().min(1).optional(),
  actorType: z.nativeEnum(FinancialActorType).optional(),
  eventType: z.nativeEnum(FinancialEventType).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SetCreditLimitInput = z.infer<typeof setCreditLimitSchema>;
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;
export type ListCreditTransactionsQuery = z.infer<typeof listCreditTransactionsQuerySchema>;
export type ListFinancialEventsQuery = z.infer<typeof listFinancialEventsQuerySchema>;
