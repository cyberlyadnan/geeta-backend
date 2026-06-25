import { z } from 'zod';

export const createProductionOrderSchema = z.object({
  productId: z.string().min(1),
  versionId: z.string().optional(),
  orderName: z.string().min(1).max(200),
  quantity: z.number().int().min(1),
  selections: z.record(z.string(), z.string()).default({}),
  orderDeliveryChoice: z.boolean().optional().nullable(),
  deliveryAddress: z.string().max(2000).optional().nullable(),
  specialRemark: z.string().max(2000).optional(),
  pressline: z.string().max(200).optional(),
  fileOption: z.enum(['attach', 'email']).optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().min(1),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
