import { z } from 'zod';
import { ProductionOrderStatus } from '@prisma/client';

const dateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const purchaseReportQuerySchema = z.object({
  ...dateRange,
  status: z.nativeEnum(ProductionOrderStatus).optional(),
  /** Free text across order number, job name and product. */
  search: z.string().trim().min(1).max(120).optional(),
  productFamilyId: z.string().cuid().optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  /** Reprints are free replacements — usually excluded when a vendor totals their spend. */
  includeReprints: z.coerce.boolean().default(true),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const invoiceListQuerySchema = z.object({
  ...dateRange,
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export const walletStatementQuerySchema = z.object({
  ...dateRange,
  type: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const summaryQuerySchema = z.object({
  ...dateRange,
  /** Bucket size for the trend series. */
  groupBy: z.enum(['day', 'week', 'month']).default('month'),
});

export const vendorExportQuerySchema = z.object({
  ...dateRange,
  pack: z
    .enum(['purchase-register', 'invoice-register', 'wallet-statement', 'ca-pack'])
    .default('ca-pack'),
  includeReprints: z.coerce.boolean().default(true),
});

export const invoiceIdParamSchema = z.object({ id: z.string().cuid() });

export type PurchaseReportQuery = z.infer<typeof purchaseReportQuerySchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type WalletStatementQuery = z.infer<typeof walletStatementQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type VendorExportQuery = z.infer<typeof vendorExportQuerySchema>;
