import { z } from 'zod';
import { SlideStatus } from '@prisma/client';
import { GLOBAL_SLIDER_KEY } from './slider.constants.js';

const optionalUrl = z
  .string()
  .url('Must be a valid URL')
  .max(2048)
  .optional()
  .or(z.literal('').transform(() => undefined));

const optionalDate = z
  .string()
  .datetime({ offset: true })
  .optional()
  .or(z.literal('').transform(() => undefined));

export const sliderKeyQuerySchema = z.object({
  sliderKey: z.string().min(1).max(64).default(GLOBAL_SLIDER_KEY),
});

export const listAdminSlidesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(SlideStatus).optional(),
  sortBy: z.enum(['displayOrder', 'createdAt', 'title', 'status', 'startDate', 'endDate']).default('displayOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  sliderKey: z.string().min(1).max(64).default(GLOBAL_SLIDER_KEY),
});

export const slideIdParamSchema = z.object({
  id: z.string().min(1),
});

const slideFieldsSchema = z.object({
  sliderKey: z.string().min(1).max(64).default(GLOBAL_SLIDER_KEY),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url(),
  imageKey: z.string().min(1).max(512),
  redirectUrl: optionalUrl,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: z.string().max(5000).optional(),
  status: z.nativeEnum(SlideStatus).optional(),
});

function slideDateRangeRefine<T extends { startDate?: string; endDate?: string }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (!data.startDate || !data.endDate) return;
  if (new Date(data.startDate) > new Date(data.endDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be on or after start date',
      path: ['endDate'],
    });
  }
}

export const createSlideSchema = slideFieldsSchema.superRefine(slideDateRangeRefine);

export const updateSlideSchema = slideFieldsSchema
  .partial()
  .extend({
    imageUrl: z.string().url().optional(),
    imageKey: z.string().min(1).max(512).optional(),
  })
  .superRefine(slideDateRangeRefine);

export const reorderSlidesSchema = z.object({
  sliderKey: z.string().min(1).max(64).default(GLOBAL_SLIDER_KEY),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const bulkSlideStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  status: z.nativeEnum(SlideStatus),
});

export const updateSlideStatusSchema = z.object({
  status: z.nativeEnum(SlideStatus),
});

export type ListAdminSlidesQuery = z.infer<typeof listAdminSlidesQuerySchema>;
export type CreateSlideInput = z.infer<typeof createSlideSchema>;
export type UpdateSlideInput = z.infer<typeof updateSlideSchema>;
export type ReorderSlidesInput = z.infer<typeof reorderSlidesSchema>;
export type BulkSlideStatusInput = z.infer<typeof bulkSlideStatusSchema>;
