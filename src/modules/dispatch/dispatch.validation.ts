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

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;
export type SetDeliveryChargeInput = z.infer<typeof setDeliveryChargeSchema>;
