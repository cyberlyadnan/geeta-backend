import { z } from 'zod';

export const designTaskIdParamSchema = z.object({ id: z.string().min(1) });

export const orderIdParamSchema = z.object({ orderId: z.string().min(1) });

export const submitProofSchema = z.object({
  proofUrl: z.string().url().max(2000),
  notes: z.string().max(2000).optional(),
});

export const vendorDecisionSchema = z
  .object({
    approved: z.boolean(),
    revisionNote: z.string().max(2000).optional(),
  })
  .refine((value) => value.approved || Boolean(value.revisionNote?.trim()), {
    message: 'Tell the design team what to change',
    path: ['revisionNote'],
  });

export const listDesignQueueQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'IN_PROGRESS', 'AWAITING_VENDOR_APPROVAL', 'REVISION_REQUESTED', 'APPROVED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const presignDesignAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export const registerDesignAttachmentSchema = z.object({
  key: z.string().min(1),
  publicUrl: z.string().url(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

/** Design team requests an upload URL to push a finished proof/design file straight to a
 *  design task — scoped by :id (the design task), unlike reference-material presigning which
 *  happens before any task exists. */
export const presignDesignProofSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export type SubmitProofInput = z.infer<typeof submitProofSchema>;
export type VendorDecisionInput = z.infer<typeof vendorDecisionSchema>;
export type ListDesignQueueQuery = z.infer<typeof listDesignQueueQuerySchema>;
export type PresignDesignAttachmentInput = z.infer<typeof presignDesignAttachmentSchema>;
export type RegisterDesignAttachmentInput = z.infer<typeof registerDesignAttachmentSchema>;
export type PresignDesignProofInput = z.infer<typeof presignDesignProofSchema>;
