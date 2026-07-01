import { z } from 'zod';
import {
  QcAttachmentCategory,
  QualityDefectSeverity,
  QualityInspectionResult,
} from '@prisma/client';

export const taskIdParamSchema = z.object({ taskId: z.string().cuid() });
export const inspectionIdParamSchema = z.object({ inspectionId: z.string().cuid() });

export const startInspectionSchema = z.object({
  checklistTemplateId: z.string().cuid().optional(),
});

export const checklistItemSchema = z.object({
  itemCode: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  passed: z.boolean().optional(),
  remarks: z.string().max(2000).optional(),
});

export const updateChecklistSchema = z.object({
  items: z.array(checklistItemSchema).min(1),
});

export const addDefectSchema = z.object({
  category: z.string().min(1).max(100),
  severity: z.nativeEnum(QualityDefectSeverity).default('MEDIUM'),
  description: z.string().min(1).max(5000),
  remarks: z.string().max(2000).optional(),
  fileAssetId: z.string().cuid().optional(),
});

export const submitInspectionSchema = z.object({
  result: z.nativeEnum(QualityInspectionResult),
  remarks: z.string().max(5000).optional(),
  targetTaskId: z.string().cuid().optional(),
});

export const addNoteSchema = z.object({ text: z.string().min(1).max(5000) });

export const presignAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export const registerAttachmentSchema = z.object({
  category: z.nativeEnum(QcAttachmentCategory),
  label: z.string().max(200).optional(),
  key: z.string().min(1),
  publicUrl: z.string().url(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export const qcMetricsQuerySchema = z.object({
  departmentId: z.string().cuid().optional(),
});

export const departmentIdParamSchema = z.object({
  departmentId: z.string().cuid(),
});

export type SubmitInspectionBody = z.infer<typeof submitInspectionSchema>;
export type UpdateChecklistBody = z.infer<typeof updateChecklistSchema>;
export type AddDefectBody = z.infer<typeof addDefectSchema>;
export type RegisterAttachmentBody = z.infer<typeof registerAttachmentSchema>;
