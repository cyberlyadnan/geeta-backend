import { z } from 'zod';
import { DispatchBatchStatus } from '@prisma/client';

/** "HH:mm", 24-hour. Matches the DeliveryShift.cutoffTime storage format. */
const cutoffTime = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Cutoff must be a 24-hour time like "14:00"');

export const createShiftSchema = z.object({
  label: z.string().min(1).max(60),
  cutoffTime,
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateShiftSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  cutoffTime: cutoffTime.optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const shiftIdParamSchema = z.object({ id: z.string().min(1) });

export const listShiftsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
});

export const batchIdParamSchema = z.object({ id: z.string().min(1) });

export const listBatchesQuerySchema = z.object({
  shiftId: z.string().min(1).optional(),
  status: z.nativeEnum(DispatchBatchStatus).optional(),
  /** "YYYY-MM-DD" */
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const setDeliveryChargeSchema = z.object({
  amount: z.coerce.number().min(0).max(1_000_000),
});

export const removeOrderParamSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
});

export const addOrderSchema = z.object({
  orderId: z.string().min(1),
});

export const changeBatchShiftSchema = z.object({
  shiftId: z.string().min(1),
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
export type SetDeliveryChargeInput = z.infer<typeof setDeliveryChargeSchema>;
export type RemoveOrderParam = z.infer<typeof removeOrderParamSchema>;
export type AddOrderInput = z.infer<typeof addOrderSchema>;
export type ChangeBatchShiftInput = z.infer<typeof changeBatchShiftSchema>;

/**
 * Phase 7: send a particular consignment by a service other than the vendor's usual one.
 *
 * Null clears the override and puts the batch back on the vendor's tag — which is the right way
 * to undo a mistake, because it keeps following the vendor if their tag later changes.
 */
export const setBatchDeliveryServiceSchema = z.object({
  deliveryServiceId: z.string().cuid().nullable(),
});

export type SetBatchDeliveryServiceInput = z.infer<typeof setBatchDeliveryServiceSchema>;
