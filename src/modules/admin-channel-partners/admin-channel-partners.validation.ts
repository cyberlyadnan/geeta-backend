import { z } from 'zod';
import {
  ChannelPartnerLinkSource,
  ChannelPartnerStatus,
  CommissionBasis,
  CommissionPlanStatus,
} from '@prisma/client';

export const partnerIdParamSchema = z.object({ id: z.string().cuid() });
export const assignmentIdParamSchema = z.object({
  id: z.string().cuid(),
  assignmentId: z.string().cuid(),
});

export const listPartnersQuerySchema = z.object({
  status: z.nativeEnum(ChannelPartnerStatus).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** Promoting an existing vendor. The vendor keeps their own account exactly as it is. */
export const promoteVendorSchema = z.object({
  vendorUserId: z.string().cuid(),
  displayName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updatePartnerSchema = z.object({
  status: z.nativeEnum(ChannelPartnerStatus).optional(),
  displayName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const assignVendorsSchema = z.object({
  vendorUserIds: z.array(z.string().cuid()).min(1).max(200),
  source: z.nativeEnum(ChannelPartnerLinkSource).default(ChannelPartnerLinkSource.ADMIN_ASSIGNED),
  notes: z.string().trim().max(600).optional(),
});

export const unassignVendorSchema = z.object({
  reason: z.string().trim().max(600).optional(),
});

export const partnerStatsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const assignableVendorsQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  /** Hide vendors already linked to some partner — the default when picking who to add. */
  unlinkedOnly: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const commissionPlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  basis: z.nativeEnum(CommissionBasis).default(CommissionBasis.ORDER_SUBTOTAL),
  ratePercent: z.coerce.number().min(0).max(50),
  minOrderValue: z.coerce.number().min(0).max(9_999_999).default(0),
  monthlyCap: z.coerce.number().min(0).max(9_999_999).default(0),
  status: z.nativeEnum(CommissionPlanStatus).default(CommissionPlanStatus.DRAFT),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  notes: z.string().trim().max(600).optional(),
});

export type ListPartnersQuery = z.infer<typeof listPartnersQuerySchema>;
export type PromoteVendorInput = z.infer<typeof promoteVendorSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
export type AssignVendorsInput = z.infer<typeof assignVendorsSchema>;
export type UnassignVendorInput = z.infer<typeof unassignVendorSchema>;
export type PartnerStatsQuery = z.infer<typeof partnerStatsQuerySchema>;
export type AssignableVendorsQuery = z.infer<typeof assignableVendorsQuerySchema>;
export type CommissionPlanInput = z.infer<typeof commissionPlanSchema>;
