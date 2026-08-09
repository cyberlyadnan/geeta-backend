import { z } from 'zod';
import { WorkflowPriority } from '@prisma/client';

export const taskIdParamSchema = z.object({
  taskId: z.string().cuid(),
});

export const assignmentIdParamSchema = z.object({
  assignmentId: z.string().cuid(),
});

export const assignTaskSchema = z.object({
  taskId: z.string().cuid(),
  operatorId: z.string().cuid(),
  machineId: z.string().cuid().optional(),
  priority: z.nativeEnum(WorkflowPriority).optional(),
  dueAt: z.string().datetime().optional(),
  remarks: z.string().max(2000).optional(),
});

export const reassignTaskSchema = z.object({
  operatorId: z.string().cuid().optional(),
  machineId: z.string().cuid().nullable().optional(),
  priority: z.nativeEnum(WorkflowPriority).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  remarks: z.string().max(2000).optional(),
});

export const unassignTaskSchema = z.object({
  remarks: z.string().max(2000).optional(),
});

export const operatorSearchQuerySchema = z.object({
  departmentId: z.string().cuid(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const myTasksQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.string().optional(),
  /** "active" (default) hides finished work; "completed" shows only what this operator has
   *  actually finished, for the Completed tab on the My tasks page. */
  scope: z.enum(['active', 'completed']).optional(),
});

export type AssignTaskBody = z.infer<typeof assignTaskSchema>;
export type ReassignTaskBody = z.infer<typeof reassignTaskSchema>;
export type UnassignTaskBody = z.infer<typeof unassignTaskSchema>;
export type OperatorSearchQuery = z.infer<typeof operatorSearchQuerySchema>;
export type MyTasksQuery = z.infer<typeof myTasksQuerySchema>;
