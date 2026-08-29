import { z } from 'zod';
import { SupportAttachmentKind, SupportTicketCategory, SupportTicketStatus, SupportTicketType } from '@prisma/client';

export const supportIdParamSchema = z.object({ id: z.string().cuid() });

const attachmentSchema = z.object({
  fileKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.coerce.number().int().positive().max(200 * 1024 * 1024),
  kind: z.nativeEnum(SupportAttachmentKind),
});

export const reprintEligibilityQuerySchema = z.object({
  orderNumber: z.string().trim().min(3).max(40).optional(),
  orderId: z.string().cuid().optional(),
}).refine((data) => data.orderNumber ?? data.orderId, {
  message: 'Enter an order number to check',
});

/**
 * A reprint request. The order is required and the description is not optional: "please reprint"
 * with no explanation is what makes a desk chase a vendor for two days, so the form asks for the
 * problem up front.
 */
export const raiseReprintSchema = z.object({
  orderId: z.string().cuid(),
  category: z.nativeEnum(SupportTicketCategory).default(SupportTicketCategory.PRINT_QUALITY),
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(10).max(4000),
  requestedQuantity: z.coerce.number().int().positive().max(1_000_000).optional(),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const raiseComplaintSchema = z.object({
  category: z.nativeEnum(SupportTicketCategory).default(SupportTicketCategory.OTHER),
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(10).max(4000),
  /** Optional — a billing question may not be about one particular order. */
  orderId: z.string().cuid().optional(),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const listMyTicketsQuerySchema = z.object({
  type: z.nativeEnum(SupportTicketType).optional(),
  status: z.nativeEnum(SupportTicketStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachments: z.array(attachmentSchema).max(10).default([]),
});

export const uploadTicketSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  fileSize: z.coerce.number().int().positive(),
});

export const rateTicketSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional(),
});

export type RaiseReprintInput = z.infer<typeof raiseReprintSchema>;
export type RaiseComplaintInput = z.infer<typeof raiseComplaintSchema>;
export type ListMyTicketsQuery = z.infer<typeof listMyTicketsQuerySchema>;
export type ReplyInput = z.infer<typeof replySchema>;
export type UploadTicketInput = z.infer<typeof uploadTicketSchema>;
export type RateTicketInput = z.infer<typeof rateTicketSchema>;
export type ReprintEligibilityQuery = z.infer<typeof reprintEligibilityQuerySchema>;
