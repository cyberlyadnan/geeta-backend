import { z } from 'zod';
import { createProductionOrderSchema, orderPreviewSchema } from '../orders/orders.validation.js';

export const actingAsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('vendor'), vendorId: z.string().min(1) }),
  z.object({
    type: z.literal('retail'),
    phone: z.string().min(1),
    name: z.string().min(1),
    hasGst: z.boolean().optional(),
    gstNumber: z.string().optional(),
  }),
]);

export const adminOrderPreviewSchema = orderPreviewSchema.extend({ actingAs: actingAsSchema });
export const adminCreateOrderSchema = createProductionOrderSchema.extend({ actingAs: actingAsSchema });

export type ActingAs = z.infer<typeof actingAsSchema>;
export type AdminOrderPreviewInput = z.infer<typeof adminOrderPreviewSchema>;
export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;
