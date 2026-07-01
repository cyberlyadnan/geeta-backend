import { z } from 'zod';
import { WorkflowTaskStatus } from '@prisma/client';

export const workflowIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const workflowOrderIdParamSchema = z.object({
  orderId: z.string().cuid(),
});

export const workflowTaskIdParamSchema = z.object({
  taskId: z.string().cuid(),
});

export const workflowCursorQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const advanceWorkflowSchema = z.object({
  taskId: z.string().cuid(),
  action: z.enum(['complete', 'skip', 'cancel']),
  remarks: z.string().max(2000).optional(),
});

export type AdvanceWorkflowBody = z.infer<typeof advanceWorkflowSchema>;
export type WorkflowCursorQuery = z.infer<typeof workflowCursorQuerySchema>;

export const TERMINAL_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.CANCELLED,
  WorkflowTaskStatus.SKIPPED,
];
