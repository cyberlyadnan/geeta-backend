import { z } from 'zod';

export const expensesIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const expensesListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
