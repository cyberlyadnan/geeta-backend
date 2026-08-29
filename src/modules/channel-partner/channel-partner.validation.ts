import { z } from 'zod';

const dateRange = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };

export const partnerOverviewQuerySchema = z.object(dateRange);

export const partnerVendorListQuerySchema = z.object({
  ...dateRange,
  search: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(['purchase', 'orders', 'recent', 'name']).default('purchase'),
});

export type PartnerOverviewQuery = z.infer<typeof partnerOverviewQuerySchema>;
export type PartnerVendorListQuery = z.infer<typeof partnerVendorListQuerySchema>;
