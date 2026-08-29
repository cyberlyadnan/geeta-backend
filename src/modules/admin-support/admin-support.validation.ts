import { z } from 'zod';
import {
  SupportAttachmentKind,
  SupportTicketCategory,
  SupportTicketChannel,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from '@prisma/client';

export const ticketIdParamSchema = z.object({ id: z.string().cuid() });

const attachmentSchema = z.object({
  fileKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.coerce.number().int().positive(),
  kind: z.nativeEnum(SupportAttachmentKind),
});

export const queueQuerySchema = z.object({
  type: z.nativeEnum(SupportTicketType).optional(),
  status: z.nativeEnum(SupportTicketStatus).optional(),
  category: z.nativeEnum(SupportTicketCategory).optional(),
  priority: z.nativeEnum(SupportTicketPriority).optional(),
  assignedToId: z.string().cuid().optional(),
  /** "Give me everything nobody has picked up." */
  unassignedOnly: z.coerce.boolean().default(false),
  /** SLA breached and still unanswered — the queue a shift lead works first. */
  overdueOnly: z.coerce.boolean().default(false),
  vendorUserId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(['newest', 'oldest', 'priority', 'sla']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const staffReplySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Internal notes never reach the vendor and never stop the SLA clock. */
  isInternal: z.boolean().default(false),
  attachments: z.array(attachmentSchema).max(10).default([]),
  /** Set when the reply is a question — moves the ticket into AWAITING_CUSTOMER. */
  requestsInformation: z.boolean().default(false),
});

export const assignSchema = z.object({
  assignedToId: z.string().cuid().nullable(),
});

export const updateTicketSchema = z.object({
  priority: z.nativeEnum(SupportTicketPriority).optional(),
  category: z.nativeEnum(SupportTicketCategory).optional(),
  status: z.nativeEnum(SupportTicketStatus).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

/**
 * Approving a reprint. `chargeAmount` defaults to zero because the vendor already paid for this
 * job once; a non-zero value is a deliberate decision the approver has to type.
 */
export const approveReprintSchema = z.object({
  quantity: z.coerce.number().int().positive().max(1_000_000).optional(),
  chargeAmount: z.coerce.number().min(0).max(9_999_999).default(0),
  copyArtwork: z.boolean().default(true),
  remarks: z.string().trim().min(3).max(1000),
  /** Send the reprint straight into production, or hold it for the vendor to confirm first. */
  createOrderNow: z.boolean().default(true),
});

export const rejectSchema = z.object({
  remarks: z.string().trim().min(5).max(1000),
});

export const resolveSchema = z.object({
  remarks: z.string().trim().max(1000).optional(),
});

export const raiseOnBehalfSchema = z.object({
  vendorUserId: z.string().cuid().optional(),
  retailCustomerId: z.string().cuid().optional(),
  type: z.nativeEnum(SupportTicketType),
  category: z.nativeEnum(SupportTicketCategory).default(SupportTicketCategory.OTHER),
  channel: z.nativeEnum(SupportTicketChannel).default(SupportTicketChannel.PHONE),
  priority: z.nativeEnum(SupportTicketPriority).default(SupportTicketPriority.NORMAL),
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(5).max(4000),
  orderId: z.string().cuid().optional(),
  requestedQuantity: z.coerce.number().int().positive().optional(),
  attachments: z.array(attachmentSchema).max(10).default([]),
}).refine((data) => data.vendorUserId ?? data.retailCustomerId, {
  message: 'Choose the customer this ticket belongs to',
});

export const supportSettingsSchema = z.object({
  reprintWindowDays: z.coerce.number().int().min(0).max(365).optional(),
  reprintRequiresDispatch: z.boolean().optional(),
  responseSlaHours: z.coerce.number().int().min(1).max(720).optional(),
  maxAttachmentsPerTicket: z.coerce.number().int().min(1).max(30).optional(),
  maxImageSizeMb: z.coerce.number().int().min(1).max(50).optional(),
  maxVideoSizeMb: z.coerce.number().int().min(1).max(500).optional(),
  autoCloseResolvedAfterDays: z.coerce.number().int().min(0).max(90).optional(),
  reprintFreeByDefault: z.boolean().optional(),
  supportPhone: z.string().trim().max(40).optional(),
  supportEmail: z.string().trim().max(120).optional(),
  supportHours: z.string().trim().max(160).optional(),
  reprintPolicyContent: z.record(z.string(), z.string()).optional(),
});

export const statsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;
export type StaffReplyInput = z.infer<typeof staffReplySchema>;
export type AssignInput = z.infer<typeof assignSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ApproveReprintInput = z.infer<typeof approveReprintSchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
export type ResolveInput = z.infer<typeof resolveSchema>;
export type RaiseOnBehalfInput = z.infer<typeof raiseOnBehalfSchema>;
export type SupportSettingsInput = z.infer<typeof supportSettingsSchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
