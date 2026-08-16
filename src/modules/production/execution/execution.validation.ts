import { z } from 'zod';
import {
  ProductionAttachmentCategory,
  ProductionHoldReason,
} from '@prisma/client';

export const taskIdParamSchema = z.object({
  taskId: z.string().cuid(),
});

export const departmentIdParamSchema = z.object({
  departmentId: z.string().cuid(),
});

export const executionActionSchema = z.object({
  remarks: z.string().max(2000).optional(),
});

export const holdTaskSchema = z.object({
  reason: z.nativeEnum(ProductionHoldReason),
  notes: z.string().max(2000).optional(),
});

export const flagForCorrectionSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export const resolveCorrectionSchema = z.object({
  remarks: z.string().max(2000).optional(),
});

export const addNoteSchema = z.object({
  text: z.string().min(1).max(5000),
  fileAssetId: z.string().cuid().optional(),
});

export const registerAttachmentSchema = z.object({
  // fileAssetId used to be required here but the service creates the FileAsset itself from
  // (key, publicUrl, mimeType, …), so requiring it made every upload fail validation with the
  // client sending fields the schema didn't ask for. Kept optional in case future callers
  // register a pre-existing asset — the service picks the raw fields regardless.
  fileAssetId: z.string().cuid().optional(),
  category: z.nativeEnum(ProductionAttachmentCategory),
  label: z.string().max(200).optional(),
  key: z.string().min(1),
  publicUrl: z.string().url(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export const presignAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export const alertSchema = z.object({
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const departmentExecutionQuerySchema = z.object({
  status: z.enum(['IN_PROGRESS', 'PAUSED', 'ON_HOLD', 'COMPLETED']).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const listNotesQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ExecutionActionBody = z.infer<typeof executionActionSchema>;
export type HoldTaskBody = z.infer<typeof holdTaskSchema>;
export type FlagForCorrectionBody = z.infer<typeof flagForCorrectionSchema>;
export type ResolveCorrectionBody = z.infer<typeof resolveCorrectionSchema>;
export type AddNoteBody = z.infer<typeof addNoteSchema>;
export type RegisterAttachmentBody = z.infer<typeof registerAttachmentSchema>;
export type PresignAttachmentBody = z.infer<typeof presignAttachmentSchema>;
export type AlertBody = z.infer<typeof alertSchema>;
export type DepartmentExecutionQuery = z.infer<typeof departmentExecutionQuerySchema>;
