import { z } from 'zod';
import {
  ProductStatus,
  ProductVisibility,
  PricingAdjustmentType,
  ConfigurationFieldType,
  ConfigurationRuleType,
  PricingRuleStatus,
  OptionPricingStrategy,
} from '@prisma/client';

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: z.string().optional(),
  familyId: z.string().optional(),
  seriesId: z.string().optional(),
  visibility: z.nativeEnum(ProductVisibility).optional(),
  sortBy: z.enum(['name', 'createdAt', 'sortOrder', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const productIdParamSchema = z.object({ id: z.string().min(1) });

const attributeValueSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  value: z.string().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  pricingStrategy: z.nativeEnum(OptionPricingStrategy).optional(),
  adjustmentType: z.nativeEnum(PricingAdjustmentType).optional(),
  adjustmentValue: z.number().optional(),
  strategyConfig: z.record(z.unknown()).optional(),
  quantityTiers: z.array(z.object({
    id: z.string().min(1).optional(),
    quantity: z.number().int().positive(),
    price: z.number().min(0),
    isActive: z.boolean().optional(),
  })).optional(),
});

const attributeSchema = z.object({
  code: z.string().min(1).max(64),
  label: z.string().min(1),
  fieldType: z.nativeEnum(ConfigurationFieldType).default('DROPDOWN'),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  values: z.array(attributeValueSchema).optional(),
});

const quantityTierSchema = z.object({
  quantity: z.number().int().positive(),
  basePrice: z.number().positive(),
});

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  /** Explicit catalog placement — no auto-created family/series. */
  seriesId: z.string().min(1),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  sku: z.string().optional(),
  visibility: z.nativeEnum(ProductVisibility).default('VENDOR_ONLY'),
  status: z.nativeEnum(ProductStatus).default('DRAFT'),
  sortOrder: z.number().int().optional(),
  isFeatured: z.boolean().optional(),
  thumbnailUrl: z.string().url().optional(),
  thumbnailKey: z.string().optional(),
  quantityTiers: z.array(quantityTierSchema).optional(),
  attributes: z.array(attributeSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const pricingContextSchema = z.object({
  selectedSize: z.object({
    sizeCode: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    unit: z.enum(['MM', 'CM', 'INCH', 'FT']).optional(),
  }).optional(),
  areaSqCm: z.number().optional(),
  sheetCount: z.number().optional(),
  sheetSize: z.string().optional().nullable(),
  paperMaterial: z.string().optional().nullable(),
  printProcess: z.string().optional().nullable(),
  lamination: z.string().optional().nullable(),
  uv: z.string().optional().nullable(),
  foil: z.string().optional().nullable(),
  embossing: z.string().optional().nullable(),
  eyelets: z.string().optional().nullable(),
  dispatchOption: z.string().optional().nullable(),
  customerType: z.string().optional().nullable(),
  productionPriority: z.string().optional().nullable(),
  facility: z.string().optional().nullable(),
  machine: z.string().optional().nullable(),
  pieceCount: z.number().optional(),
  boxCount: z.number().optional(),
  runtimeValues: z.record(z.unknown()).optional(),
}).passthrough();

export const calculatePriceSchema = z.object({
  productId: z.string().optional(),
  versionId: z.string().optional(),
  quantity: z.number().int().positive(),
  selections: z.record(z.string()).default({}),
  context: pricingContextSchema.optional(),
}).refine((d) => d.productId || d.versionId, {
  message: 'productId or versionId is required',
});

export const createAttributeSchema = z.object({
  versionId: z.string().min(1),
  code: z.string().min(1).max(64),
  label: z.string().min(1),
  description: z.string().max(2000).optional().nullable(),
  fieldType: z.nativeEnum(ConfigurationFieldType).default('DROPDOWN'),
  placeholder: z.string().max(200).optional().nullable(),
  isRequired: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  values: z.array(attributeValueSchema).optional(),
});

export const updateAttributeSchema = createAttributeSchema.partial().omit({ versionId: true });

export const attributeIdParamSchema = z.object({ id: z.string().min(1) });

export const listAttributesQuerySchema = z.object({
  versionId: z.string().min(1),
});

export const createPricingRuleSchema = z.object({
  versionId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  configurationFieldId: z.string().optional(),
  configurationOptionId: z.string().optional(),
  adjustmentType: z.nativeEnum(PricingAdjustmentType),
  adjustmentValue: z.number(),
  priority: z.number().int().default(0),
  condition: z.record(z.unknown()).optional(),
  status: z.nativeEnum(PricingRuleStatus).default('ACTIVE'),
});

export const updatePricingRuleSchema = createPricingRuleSchema.partial().omit({ versionId: true });

export const pricingRuleIdParamSchema = z.object({ id: z.string().min(1) });

export const listPricingRulesQuerySchema = z.object({
  versionId: z.string().min(1),
});

export const upsertQuantityTierSchema = z.object({
  /** Set when editing an existing tier — without it a changed quantity would create a duplicate
   *  row instead of moving the tier, since the natural key is (version, quantity). */
  id: z.string().min(1).optional(),
  versionId: z.string().min(1),
  quantity: z.number().int().positive(),
  basePrice: z.number().positive(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  /** Advanced only — not used for catalog building (families replace nesting). */
  parentId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  imageKey: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryIdParamSchema = z.object({ id: z.string().min(1) });

export const listFamiliesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const createFamilySchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  imageKey: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const updateFamilySchema = createFamilySchema.partial();

export const familyIdParamSchema = z.object({ id: z.string().min(1) });

export const listSeriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().optional(),
  familyId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const createSeriesSchema = z.object({
  familyId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  imageKey: z.string().optional().nullable(),
  productCode: z.string().max(64).optional().nullable(),
  productionDays: z.number().int().positive().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export const updateSeriesSchema = createSeriesSchema.partial();

export const seriesIdParamSchema = z.object({ id: z.string().min(1) });

export const reorderCatalogSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ).min(1),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CalculatePriceInput = z.infer<typeof calculatePriceSchema>;
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
export type ListAttributesQuery = z.infer<typeof listAttributesQuerySchema>;
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;
export type ListPricingRulesQuery = z.infer<typeof listPricingRulesQuerySchema>;
export type UpsertQuantityTierInput = z.infer<typeof upsertQuantityTierSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListFamiliesQuery = z.infer<typeof listFamiliesQuerySchema>;
export type CreateFamilyInput = z.infer<typeof createFamilySchema>;
export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>;
export type ListSeriesQuery = z.infer<typeof listSeriesQuerySchema>;
export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;
export type ReorderCatalogInput = z.infer<typeof reorderCatalogSchema>;

/** Simple condition: { field, equals } | { field, in: [] } | { and|or: [] } */
const configConditionSchema: z.ZodType<Record<string, unknown>> = z.record(z.unknown());

export const createConfigRuleSchema = z.object({
  versionId: z.string().min(1),
  targetFieldId: z.string().min(1),
  ruleType: z.nativeEnum(ConfigurationRuleType),
  condition: configConditionSchema,
  sortOrder: z.number().int().optional(),
});

export const updateConfigRuleSchema = createConfigRuleSchema.partial().omit({ versionId: true });

export const configRuleIdParamSchema = z.object({ id: z.string().min(1) });

export const listConfigRulesQuerySchema = z.object({
  versionId: z.string().min(1),
});

export const orderConfigurationQuerySchema = z.object({
  versionId: z.string().min(1),
  /** Optional JSON string of current vendor selections for resolved visibility */
  selections: z.string().optional(),
});

export type CreateConfigRuleInput = z.infer<typeof createConfigRuleSchema>;
export type UpdateConfigRuleInput = z.infer<typeof updateConfigRuleSchema>;
export type ListConfigRulesQuery = z.infer<typeof listConfigRulesQuerySchema>;
export type OrderConfigurationQuery = z.infer<typeof orderConfigurationQuerySchema>;
