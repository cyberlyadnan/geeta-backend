import { z } from 'zod';

export const paymentsIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const paymentsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
