import { z } from 'zod';
import {
  DeliveryAssignmentStatus,
  DeliveryServiceKind,
} from '@prisma/client';

export const serviceIdParamSchema = z.object({ id: z.string().cuid() });
export const assignmentIdParamSchema = z.object({ id: z.string().cuid() });
export const agentIdParamSchema = z.object({ id: z.string().cuid() });

/**
 * `code` is uppercased and stripped here rather than in the service, so the uniqueness the
 * database enforces is on the same string a human typed — "bus service" and "BUS_SERVICE" must
 * not both get in.
 */
const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Use letters, numbers and hyphens only')
  .transform((value) => value.toUpperCase());

export const createServiceSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(80),
  kind: z.nativeEnum(DeliveryServiceKind).default(DeliveryServiceKind.OTHER),
  description: z.string().trim().max(600).optional(),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4f46e5')
    .default('#4f46e5'),
  requiresTrackingNumber: z.boolean().default(false),
  slaHours: z.coerce.number().int().min(1).max(2160).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateServiceSchema = createServiceSchema.partial().omit({ code: true });

export const listServicesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(false),
  search: z.string().trim().min(1).max(80).optional(),
});

/** Whole-set replacement: the admin saves a form, not a diff. */
export const setAgentServicesSchema = z.object({
  deliveryServiceIds: z.array(z.string().cuid()).max(30),
});

export const setVendorServicesSchema = z.object({
  deliveryServiceIds: z.array(z.string().cuid()).max(30),
  defaultDeliveryServiceId: z.string().cuid().nullable().optional(),
});

export const listAgentsQuerySchema = z.object({
  deliveryServiceId: z.string().cuid().optional(),
  search: z.string().trim().min(1).max(80).optional(),
  includeInactive: z.coerce.boolean().default(false),
});

export const listAssignmentsQuerySchema = z.object({
  deliveryServiceId: z.string().cuid().optional(),
  status: z.nativeEnum(DeliveryAssignmentStatus).optional(),
  assignedToId: z.string().cuid().optional(),
  /** "Nobody has picked these up." The queue a supervisor works first. */
  unassignedOnly: z.coerce.boolean().default(false),
  /** Past the service's promised hours and still not delivered. */
  overdueOnly: z.coerce.boolean().default(false),
  vendorUserId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'due']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const assignSchema = z.object({
  /** Null hands the consignment back to its service's shared queue. */
  assignedToId: z.string().cuid().nullable(),
});

export const rerouteSchema = z.object({
  deliveryServiceId: z.string().cuid(),
  reason: z.string().trim().max(400).optional(),
});

export const cancelAssignmentSchema = z.object({
  reason: z.string().trim().min(3).max(400),
});

export const statsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
export type SetAgentServicesInput = z.infer<typeof setAgentServicesSchema>;
export type SetVendorServicesInput = z.infer<typeof setVendorServicesSchema>;
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
export type AssignInput = z.infer<typeof assignSchema>;
export type RerouteInput = z.infer<typeof rerouteSchema>;
export type CancelAssignmentInput = z.infer<typeof cancelAssignmentSchema>;
export type DeliveryStatsQuery = z.infer<typeof statsQuerySchema>;
