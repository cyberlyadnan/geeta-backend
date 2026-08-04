import { z } from 'zod';

export const requestAmendmentSchema = z.object({
  newConfig: z.object({
    selections: z.record(z.string(), z.string()),
    quantity: z.coerce.number().int().min(1).optional(),
  }),
  reason: z.string().max(2000).optional(),
});

export const amendmentOrderIdParamSchema = z.object({
  orderId: z.string().min(1),
});

export type RequestAmendmentInput = z.infer<typeof requestAmendmentSchema>;
