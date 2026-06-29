import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional(),
});

export const rateCatalogCategoriesQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  parentId: z.string().optional(),
});

export const rateCatalogProductsQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  categoryId: z.string().optional(),
  printProcessCode: z.string().optional(),
  pricingStrategyKey: z.string().optional(),
  onlyActive: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  /** Dynamic attribute filters — e.g. paper, gsm, lamination */
  paper: z.string().optional(),
  gsm: z.string().optional(),
  lamination: z.string().optional(),
  binding: z.string().optional(),
  uv: z.string().optional(),
  foiling: z.string().optional(),
  printSide: z.string().optional(),
  color: z.string().optional(),
});

export const rateCatalogSearchQuerySchema = rateCatalogProductsQuerySchema;

export const rateCatalogProductRatesQuerySchema = paginationSchema.extend({
  rowPage: z.coerce.number().int().min(1).default(1),
  rowLimit: z.coerce.number().int().min(1).max(50).default(20),
  includeGst: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v !== false && v !== 'false'),
  /** Fixed configuration filters for matrix rows */
  paper: z.string().optional(),
  gsm: z.string().optional(),
  lamination: z.string().optional(),
  binding: z.string().optional(),
  uv: z.string().optional(),
  foiling: z.string().optional(),
  printSide: z.string().optional(),
  color: z.string().optional(),
  finish: z.string().optional(),
  material: z.string().optional(),
});

export const rateCatalogExportQuerySchema = rateCatalogProductRatesQuerySchema;

export type RateCatalogCategoriesQuery = z.infer<typeof rateCatalogCategoriesQuerySchema>;
export type RateCatalogProductsQuery = z.infer<typeof rateCatalogProductsQuerySchema>;
export type RateCatalogProductRatesQuery = z.infer<typeof rateCatalogProductRatesQuerySchema>;
export type RateCatalogExportQuery = z.infer<typeof rateCatalogExportQuerySchema>;
