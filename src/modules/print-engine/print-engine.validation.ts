import { z } from 'zod';

export const versionIdParamSchema = z.object({
  versionId: z.string().min(1),
});

export const artworkVersionIdParamSchema = z.object({
  artworkVersionId: z.string().min(1),
});

export const sizeInputSchema = z.object({
  strategyType: z.enum([
    'FIXED_SIZE',
    'SHEET_BASED',
    'AREA_BASED',
    'CUSTOM_SIZE',
    'ROLL_BASED',
    'COVERAGE_BASED',
  ]).optional(),
  sizeCode: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  unit: z.enum(['MM', 'CM', 'INCH', 'FT']).optional(),
});

export const artworkPresignSchema = z.object({
  versionId: z.string().min(1),
  requirementCode: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive(),
  size: sizeInputSchema.optional(),
});

export const artworkRegisterSchema = z.object({
  versionId: z.string().min(1),
  requirementCode: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileKey: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
  size: sizeInputSchema.optional(),
});

export const artworkMultipartBodySchema = z.object({
  versionId: z.string().min(1),
  requirementCode: z.string().min(1),
  size: z.union([sizeInputSchema, z.string()]).optional(),
});

export const livePricingSchema = z.object({
  productId: z.string().min(1),
  versionId: z.string().min(1),
  quantity: z.number().int().min(1),
  selections: z.record(z.string(), z.string()).default({}),
  size: sizeInputSchema.optional(),
  coverageResults: z
    .array(
      z.object({
        coverageType: z.string(),
        coveragePercent: z.number(),
        coverageMm2: z.number(),
        coverageCm2: z.number(),
        boundingBox: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
        printablePixels: z.number().optional(),
      }),
    )
    .optional(),
  orderDeliveryChoice: z.boolean().optional().nullable(),
  deliveryAddress: z.string().max(2000).optional().nullable(),
});

export const artworkSlotSchema = z.object({
  requirementCode: z.string().min(1),
  artworkFileId: z.string().min(1),
  artworkVersionId: z.string().min(1),
});

export const upsertPrintSpecSchema = z.object({
  requiredPages: z.number().int().positive().optional().nullable(),
  pageNames: z.array(z.string()).optional(),
  artworkWidthMm: z.number().positive().optional().nullable(),
  artworkHeightMm: z.number().positive().optional().nullable(),
  finishedWidthMm: z.number().positive().optional().nullable(),
  finishedHeightMm: z.number().positive().optional().nullable(),
  bleedMm: z.number().nonnegative().optional().nullable(),
  safeAreaMm: z.number().nonnegative().optional().nullable(),
  minDpi: z.number().int().positive().optional().nullable(),
  maxFileSizeMb: z.number().int().positive().optional().nullable(),
  previewEnabled: z.boolean().optional(),
  colorMode: z.enum(['CMYK', 'RGB', 'GRAYSCALE', 'SPOT', 'ANY']).optional(),
  printingProcess: z.string().max(100).optional().nullable(),
  validationRules: z.array(z.record(z.unknown())).optional(),
  coverageTypes: z.array(z.string()).optional(),
  allowedFormats: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const upsertSizeStrategySchema = z.object({
  strategyType: z.enum([
    'FIXED_SIZE',
    'SHEET_BASED',
    'AREA_BASED',
    'CUSTOM_SIZE',
    'ROLL_BASED',
    'COVERAGE_BASED',
  ]),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const createSizeConfigSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  width: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  unit: z.enum(['MM', 'CM', 'INCH', 'FT']).default('MM'),
  sheetCode: z.string().max(20).optional().nullable(),
  areaCm2: z.number().positive().optional().nullable(),
  pricingKey: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createFileRequirementSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  requirementType: z.enum(['REQUIRED', 'OPTIONAL']),
  maxFileSizeMb: z.number().int().positive().optional(),
  allowMultiple: z.boolean().optional(),
  allowedFileTypes: z.array(z.string()).min(1),
  sortOrder: z.number().int().optional(),
});

export const createPrintLayerSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  role: z.enum([
    'MAIN',
    'UV',
    'FOIL',
    'WHITE_INK',
    'SPOT_UV',
    'RAISED_UV',
    'SCREEN',
    'DIE_LINE',
    'CUSTOM',
  ]),
  isRequired: z.boolean().optional(),
  fileRequirementId: z.string().optional(),
  coveragePricingRuleId: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const createCoverageRuleSchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  coverageType: z.string().min(1).max(50),
  pricePerCm2: z.number().nonnegative(),
  minCharge: z.number().nonnegative().optional(),
  maxCharge: z.number().nonnegative().optional(),
  supportedFileTypes: z.array(z.string()).optional(),
});

export const artworkApprovalSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
  adminNotes: z.string().max(2000).optional(),
});

export const orderArtworkIdParamSchema = z.object({
  id: z.string().min(1),
});
