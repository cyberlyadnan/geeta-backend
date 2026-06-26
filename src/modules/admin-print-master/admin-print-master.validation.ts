import { z } from 'zod';

export const listMasterQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ALL'),
  sortBy: z.string().default('sortOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const createMeasurementUnitSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  symbol: z.string().min(1).max(16),
  toMmFactor: z.number().positive(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateMeasurementUnitSchema = createMeasurementUnitSchema.partial();

export const createSheetSizeSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  width: z.number().positive(),
  height: z.number().positive(),
  measurementUnitId: z.string().min(1),
  aspectRatio: z.number().positive().optional(),
  sheetType: z.enum(['PAPER', 'FLEX', 'VINYL', 'ROLL', 'LARGE_FORMAT', 'CUSTOM']).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateSheetSizeSchema = createSheetSizeSchema.partial();

export const sizeTemplateItemSchema = z.object({
  id: z.string().optional(),
  sheetSizeId: z.string().optional(),
  code: z.string().min(1),
  label: z.string().min(1),
  width: z.number().optional(),
  height: z.number().optional(),
  unitCode: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const createSizeTemplateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  strategyType: z.enum([
    'FIXED_SIZE',
    'SHEET_BASED',
    'AREA_BASED',
    'CUSTOM_SIZE',
    'ROLL_BASED',
    'COVERAGE_BASED',
  ]),
  config: z.record(z.unknown()).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  items: z.array(sizeTemplateItemSchema).optional(),
});

export const updateSizeTemplateSchema = createSizeTemplateSchema.partial();

export const createPrintProcessSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  supportedFileTypes: z.array(z.string()).optional(),
  supportedSizeStrategies: z.array(z.string()).optional(),
  supportedValidationTypes: z.array(z.string()).optional(),
  pricingStrategyKey: z.string().optional(),
  defaultSizeTemplateId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updatePrintProcessSchema = createPrintProcessSchema.partial();

export const createPrintSpecTemplateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  allowedFormats: z.array(z.string()).optional(),
  requiredPages: z.number().int().positive().optional(),
  pageNames: z.array(z.string()).optional(),
  finishedWidthMm: z.number().positive().optional(),
  finishedHeightMm: z.number().positive().optional(),
  artworkWidthMm: z.number().positive().optional(),
  artworkHeightMm: z.number().positive().optional(),
  bleedMm: z.number().min(0).optional(),
  safeAreaMm: z.number().min(0).optional(),
  minDpi: z.number().int().positive().optional(),
  maxFileSizeMb: z.number().int().positive().optional(),
  colorMode: z.enum(['CMYK', 'RGB', 'GRAYSCALE', 'ANY']).optional(),
  previewEnabled: z.boolean().optional(),
  validationEnabled: z.boolean().optional(),
  autoArtworkAnalysis: z.boolean().optional(),
  coverageAnalysisEnabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updatePrintSpecTemplateSchema = createPrintSpecTemplateSchema.partial();

export const createMasterRuleSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  ruleType: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  failLevel: z.enum(['INFO', 'WARNING', 'ERROR']).optional(),
  message: z.string().optional(),
  warningThreshold: z.number().optional(),
  errorThreshold: z.number().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateMasterRuleSchema = createMasterRuleSchema.partial();

export const createCoverageRuleSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  coverageType: z.string().min(1),
  pricePerCm2: z.number().min(0),
  minCharge: z.number().min(0).optional(),
  maxCharge: z.number().min(0).optional(),
  supportedFileTypes: z.array(z.string()).optional(),
  validationRules: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateCoverageRuleSchema = createCoverageRuleSchema.partial();

export const createFileUploadRuleSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  requirementType: z.enum(['REQUIRED', 'OPTIONAL']),
  maxFileSizeMb: z.number().int().positive().optional(),
  allowMultiple: z.boolean().optional(),
  allowedFileTypes: z.array(z.string()).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const updateFileUploadRuleSchema = createFileUploadRuleSchema.partial();

export const assignProductPrintConfigSchema = z.object({
  printProcessId: z.string().optional().nullable(),
  sizeTemplateId: z.string().optional().nullable(),
  printSpecificationTemplateId: z.string().optional().nullable(),
  fileUploadRuleTemplateId: z.string().optional().nullable(),
  artworkRuleIds: z.array(z.string()).optional(),
  validationRuleIds: z.array(z.string()).optional(),
  coverageRuleIds: z.array(z.string()).optional(),
  pricingStrategyKey: z.string().optional().nullable(),
});

export type ListMasterQuery = z.infer<typeof listMasterQuerySchema>;
