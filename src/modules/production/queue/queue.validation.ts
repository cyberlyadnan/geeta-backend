import { z } from 'zod';
import { WorkflowInstanceStatus, WorkflowPriority, WorkflowTaskStatus } from '@prisma/client';

export const departmentIdParamSchema = z.object({
  departmentId: z.string().cuid(),
});

export const departmentQueueTaskParamSchema = z.object({
  departmentId: z.string().cuid(),
  taskId: z.string().cuid(),
});

export const departmentQueueQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().max(200).optional(),
  status: z.nativeEnum(WorkflowTaskStatus).optional(),
  priority: z.nativeEnum(WorkflowPriority).optional(),
  workflowStatus: z.nativeEnum(WorkflowInstanceStatus).optional(),
  vendorId: z.string().cuid().optional(),
  productId: z.string().cuid().optional(),
  orderNumber: z.string().max(100).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  lens: z.enum(['rush', 'rework', 'blocked', 'completedToday', 'delayed']).optional(),
  sortBy: z.enum(['stepOrder', 'priority', 'dueAt', 'createdAt']).default('stepOrder'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type DepartmentQueueQuery = z.infer<typeof departmentQueueQuerySchema>;
