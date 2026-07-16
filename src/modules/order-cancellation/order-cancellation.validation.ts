import { z } from 'zod';

export const orderIdParamSchema = z.object({
  orderId: z.string().cuid(),
});

export const requestIdParamSchema = z.object({
  requestId: z.string().cuid(),
});

export const vendorCancelSchema = z.object({
  // Seeded reason ids are stable codes (e.g. cr_customer_mind), not always cuid.
  reasonId: z.string().min(1).max(64),
  remarks: z.string().max(2000).optional(),
});

export const vendorRequestCancellationSchema = vendorCancelSchema;

export const approveCancellationSchema = z.object({
  decisionRemarks: z.string().max(2000).optional(),
});

export const rejectCancellationSchema = z.object({
  decisionRemarks: z.string().min(3).max(2000),
});

export const adminOverrideCancelSchema = vendorCancelSchema;

export const listCancellationRequestsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const upsertCancellationReasonSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[A-Z0-9_]+$/),
  label: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateCancellationReasonSchema = upsertCancellationReasonSchema.partial();

export const upsertCancellationPolicySchema = z.object({
  stageKey: z.enum(['VERIFICATION', 'ARTWORK_APPROVED', 'PRODUCTION', 'DISPATCH', 'COMPLETED']),
  label: z.string().min(2).max(200),
  vendorDirectCancel: z.boolean(),
  vendorRequestAllowed: z.boolean(),
  managerApprovalRequired: z.boolean(),
  cancellationAllowed: z.boolean(),
  policyExplanation: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type VendorCancelInput = z.infer<typeof vendorCancelSchema>;
export type VendorRequestCancellationInput = z.infer<typeof vendorRequestCancellationSchema>;
export type ApproveCancellationInput = z.infer<typeof approveCancellationSchema>;
export type RejectCancellationInput = z.infer<typeof rejectCancellationSchema>;
export type ListCancellationRequestsQuery = z.infer<typeof listCancellationRequestsQuerySchema>;
