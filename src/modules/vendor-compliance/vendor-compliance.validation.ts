import { z } from 'zod';
import {
  VendorComplianceItemType,
  VendorComplianceResponseStatus,
} from '@prisma/client';

const complianceItemSchema = z.object({
  itemType: z.nativeEnum(VendorComplianceItemType),
  code: z.string().max(64).optional(),
  label: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
  maxFileSizeMb: z.number().int().min(1).max(50).optional(),
  acceptedFileTypes: z.array(z.string().max(32)).max(20).optional(),
});

export const createComplianceRequestSchema = z.object({
  title: z.string().max(200).optional(),
  instructions: z.string().max(5000).optional(),
  dueAt: z
    .preprocess((val) => (val === '' || val == null ? undefined : val), z.coerce.date())
    .optional(),
  items: z.array(complianceItemSchema).min(1).max(50),
  sendImmediately: z.boolean().default(false),
});

export const vendorIdParamSchema = z.object({
  vendorId: z.string().min(1),
});

export const complianceRequestParamsSchema = z.object({
  vendorId: z.string().min(1),
  requestId: z.string().min(1),
});

export const reviewResponseSchema = z.object({
  status: z.enum([VendorComplianceResponseStatus.APPROVED, VendorComplianceResponseStatus.REJECTED]),
  adminRemarks: z.string().max(2000).optional(),
});

export const responseParamsSchema = z.object({
  vendorId: z.string().min(1),
  responseId: z.string().min(1),
});

export const vendorCompliancePresignSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/)),
  requestItemId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.coerce.number().int().positive(),
});

const submissionItemSchema = z.discriminatedUnion('itemType', [
  z.object({
    itemId: z.string().min(1),
    itemType: z.literal(VendorComplianceItemType.QUESTION),
    textAnswer: z.string().min(1).max(10000),
  }),
  z.object({
    itemId: z.string().min(1),
    itemType: z.literal(VendorComplianceItemType.DOCUMENT),
    fileKey: z.string().min(1).max(512),
    originalName: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    extension: z.string().min(1).max(16),
    fileSize: z.coerce.number().int().positive(),
  }),
]);

export const vendorComplianceFileAccessSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/)),
  fileAssetId: z.string().min(1),
});

export const adminFileAssetAccessParamsSchema = z.object({
  id: z.string().min(1),
  fileAssetId: z.string().min(1),
});

export const submitComplianceSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/)),
  requestId: z.string().min(1),
  responses: z.array(submissionItemSchema).min(1).max(50),
});

export type CreateComplianceRequestInput = z.infer<typeof createComplianceRequestSchema>;
export type SubmitComplianceInput = z.infer<typeof submitComplianceSchema>;
export type VendorCompliancePresignInput = z.infer<typeof vendorCompliancePresignSchema>;
