import { z } from 'zod';
import { VendorPriceOverrideType } from '@prisma/client';

export const versionIdQuerySchema = z.object({
  versionId: z.string().min(1),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

// --- 0A: Matrix cells + modifier rules ---------------------------------------------------

const matrixCellDraftSchema = z.object({
  /** e.g. { gsm: "250", sheetSize: "13x19" } — qtyBand is appended server-side per column. */
  dimensionValues: z.record(z.string().min(1)),
  qtyBand: z.string().min(1),
  price: z.number().nonnegative().nullable(),
  available: z.boolean().default(true),
  unavailableReason: z.string().max(500).optional().nullable(),
});

export const saveMatrixCellsSchema = z.object({
  versionId: z.string().min(1),
  cells: z.array(matrixCellDraftSchema).min(1),
});

export const deleteMatrixCellParamSchema = idParamSchema;

export const createModifierRuleSchema = z.object({
  versionId: z.string().min(1),
  name: z.string().min(1).max(200),
  triggerField: z.string().min(1),
  triggerValue: z.string().min(1),
  amountKey: z.string().min(1),
  /** { "120": 5, "250": 5, "350": 6 } — keyed by the amountKey field's option values. */
  amountTable: z.record(z.number()),
  appliesAfter: z.enum(['base', 'matrix']).default('base'),
});

export const updateModifierRuleSchema = createModifierRuleSchema.partial().omit({ versionId: true });

// --- 0B: Roll widths + rate per sq ft -----------------------------------------------------

export const updateFlexPricingSchema = z.object({
  versionId: z.string().min(1),
  ratePerSqFt: z.number().positive(),
  widthsFeet: z.array(z.number().positive()).min(1),
});

// --- 0C: Vendor price overrides ------------------------------------------------------------

export const createVendorOverrideSchema = z.object({
  vendorId: z.string().min(1),
  versionId: z.string().min(1),
  /** Omit for a whole-product override (e.g. a flex_area ratePerSqFt override). */
  matrixCellId: z.string().min(1).optional().nullable(),
  overrideType: z.nativeEnum(VendorPriceOverrideType),
  value: z.number(),
});

export const listVendorOverridesQuerySchema = z.object({
  versionId: z.string().min(1),
  vendorId: z.string().min(1).optional(),
});

export type SaveMatrixCellsInput = z.infer<typeof saveMatrixCellsSchema>;
export type CreateModifierRuleInput = z.infer<typeof createModifierRuleSchema>;
export type UpdateModifierRuleInput = z.infer<typeof updateModifierRuleSchema>;
export type UpdateFlexPricingInput = z.infer<typeof updateFlexPricingSchema>;
export type CreateVendorOverrideInput = z.infer<typeof createVendorOverrideSchema>;
export type ListVendorOverridesQuery = z.infer<typeof listVendorOverridesQuerySchema>;

/** Vendor-first listing: everything one vendor has negotiated, across all products. */
export const vendorIdQuerySchema = z.object({ vendorId: z.string().min(1) });
export type VendorIdQuery = z.infer<typeof vendorIdQuerySchema>;
