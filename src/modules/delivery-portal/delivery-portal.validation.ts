import { z } from 'zod';

export const assignmentIdParamSchema = z.object({ id: z.string().cuid() });

export const listQueueQuerySchema = z.object({
  /**
   * `pool` is unclaimed work on my services; `mine` is what I am carrying; `done` is what I
   * finished. Three tabs, because that is how a delivery person's day actually divides.
   */
  scope: z.enum(['pool', 'mine', 'done']).default('mine'),
  deliveryServiceId: z.string().cuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const pickupSchema = z.object({
  /** Required when the service says so — checked against the service, not hardcoded. */
  trackingNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(600).optional(),
});

export const deliverSchema = z.object({
  receiverName: z.string().trim().min(2).max(120),
  receiverPhone: z.string().trim().max(20).optional(),
  proofPhotoKey: z.string().trim().max(600).optional(),
  notes: z.string().trim().max(600).optional(),
});

export const failSchema = z.object({
  reason: z.string().trim().min(3).max(600),
  proofPhotoKey: z.string().trim().max(600).optional(),
});

export const uploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  fileSize: z.coerce.number().int().positive(),
});

export type ListQueueQuery = z.infer<typeof listQueueQuerySchema>;
export type PickupInput = z.infer<typeof pickupSchema>;
export type DeliverInput = z.infer<typeof deliverSchema>;
export type FailInput = z.infer<typeof failSchema>;
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
