import { z } from 'zod';

export const orderIdParamSchema = z.object({
  orderId: z.string().cuid(),
});

export const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const alertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;
