import { z } from 'zod';
import { ProductStatus, ProductVisibility, PricingAdjustmentType, ConfigurationFieldType, PricingRuleStatus } from '@prisma/client';

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  categoryId: z.string().optional(),
  visibility: z.nativeEnum(ProductVisibility).optional(),
  sortBy: z.enum(['name', 'createdAt', 'sortOrder', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const productIdParamSchema = z.object({ id: z.string().min(1) });

const attributeValueSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  sortOrder: z.number().int().optional(),
  adjustmentType: z.nativeEnum(PricingAdjustmentType).optional(),
  adjustmentValue: z.number().optional(),
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
  categoryId: z.string().min(1),
  subcategoryId: z.string().optional(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  sku: z.string().optional(),
  visibility: z.nativeEnum(ProductVisibility).default('VENDOR_ONLY'),
  status: z.nativeEnum(ProductStatus).default('DRAFT'),
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

export const calculatePriceSchema = z.object({
  productId: z.string().optional(),
  versionId: z.string().optional(),
  quantity: z.number().int().positive(),
  selections: z.record(z.string()).default({}),
}).refine((d) => d.productId || d.versionId, {
  message: 'productId or versionId is required',
});

export const createAttributeSchema = z.object({
  versionId: z.string().min(1),
  code: z.string().min(1).max(64),
  label: z.string().min(1),
  fieldType: z.nativeEnum(ConfigurationFieldType).default('DROPDOWN'),
  isRequired: z.boolean().optional(),
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
  versionId: z.string().min(1),
  quantity: z.number().int().positive(),
  basePrice: z.number().positive(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  imageKey: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryIdParamSchema = z.object({ id: z.string().min(1) });

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
