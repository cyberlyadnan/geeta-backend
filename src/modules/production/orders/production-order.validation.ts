import { z } from 'zod';
import {
  DeliveryType,
  ProductionOrderStatus,
  WorkflowInstanceStatus,
  WorkflowPriority,
} from '@prisma/client';

export const orderIdParamSchema = z.object({ orderId: z.string().cuid() });

export const listProductionOrdersQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
  status: z.nativeEnum(ProductionOrderStatus).optional(),
  workflowStatus: z.nativeEnum(WorkflowInstanceStatus).optional(),
  departmentId: z.string().cuid().optional(),
  operatorId: z.string().cuid().optional(),
  machineId: z.string().cuid().optional(),
  vendorId: z.string().cuid().optional(),
  productId: z.string().cuid().optional(),
  priority: z.nativeEnum(WorkflowPriority).optional(),
  rush: z.coerce.boolean().optional(),
  delayed: z.coerce.boolean().optional(),
  onHold: z.coerce.boolean().optional(),
  qcFailed: z.coerce.boolean().optional(),
  rework: z.coerce.boolean().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  paymentStatus: z.enum(['PAID', 'UNPAID']).optional(),
  deliveryType: z.nativeEnum(DeliveryType).optional(),
});

export const timelineQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().max(100).optional(),
  eventType: z.string().max(80).optional(),
});

export const activityQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListProductionOrdersQuery = z.infer<typeof listProductionOrdersQuerySchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
