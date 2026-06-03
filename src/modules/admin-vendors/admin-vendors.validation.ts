import { z } from 'zod';
import { VendorAccountStatus } from '@prisma/client';

export const listVendorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.nativeEnum(VendorAccountStatus).optional(),
  sortBy: z.enum(['createdAt', 'businessName', 'accountStatus']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const updateVendorStatusSchema = z.object({
  status: z.nativeEnum(VendorAccountStatus),
  verificationRemarks: z.string().max(2000).optional(),
});

export const createAdminNoteSchema = z.object({
  content: z.string().min(2).max(5000),
});

export const vendorIdParamSchema = z.object({
  id: z.string().min(1),
});

export const vendorActivityFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
export type VendorActivityFeedQuery = z.infer<typeof vendorActivityFeedQuerySchema>;
export type UpdateVendorStatusInput = z.infer<typeof updateVendorStatusSchema>;
export type CreateAdminNoteInput = z.infer<typeof createAdminNoteSchema>;
