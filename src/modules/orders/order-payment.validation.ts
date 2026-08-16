import { z } from 'zod';
import { PaymentReceiptMethod } from '@prisma/client';

export const orderPaymentParamSchema = z.object({
  orderId: z.string().min(1),
});

export const recordOrderPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.nativeEnum(PaymentReceiptMethod),
  notes: z.string().max(2000).optional(),
});

export type RecordOrderPaymentBody = z.infer<typeof recordOrderPaymentSchema>;
