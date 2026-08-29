import type { SupportAttachmentKind } from '@prisma/client';

export interface SupportAttachmentDto {
  id: string;
  kind: SupportAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Short-lived presigned link. Null when the object could not be signed. */
  url: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface SupportMessageDto {
  id: string;
  authorType: string;
  authorName: string;
  isInternal: boolean;
  body: string;
  attachments: SupportAttachmentDto[];
  createdAt: string;
}

export interface SupportEventDto {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SupportTicketSummaryDto {
  id: string;
  ticketNumber: string;
  type: string;
  category: string;
  status: string;
  priority: string;
  subject: string;
  orderId: string | null;
  orderNumber: string | null;
  reprintOrderId: string | null;
  reprintOrderNumber: string | null;
  attachmentCount: number;
  messageCount: number;
  /** Set on the desk's view only — a vendor has no business seeing who is handling it. */
  assignedToName?: string | null;
  assignedToId?: string | null;
  vendorName?: string | null;
  vendorCode?: string | null;
  isOverdue?: boolean;
  lastActivityAt: string;
  createdAt: string;
}

export interface SupportTicketDetailDto extends SupportTicketSummaryDto {
  description: string;
  requestedQuantity: number | null;
  reprintChargeAmount: number;
  decisionRemarks: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  slaDueAt: string | null;
  satisfactionRating: number | null;
  eligibilitySnapshot: Record<string, unknown>;
  order: {
    id: string;
    orderNumber: string;
    orderName: string | null;
    status: string;
    totalAmount: number;
    createdAt: string;
  } | null;
  reprintOrder: {
    id: string;
    orderNumber: string;
    orderName: string | null;
    status: string;
    createdAt: string;
    estimatedCompletionAt: string | null;
  } | null;
  messages: SupportMessageDto[];
  events: SupportEventDto[];
  attachments: SupportAttachmentDto[];
  /** Whether the vendor may still post a reply. */
  canReply: boolean;
  internalNotes?: string | null;
  customer?: {
    kind: 'VENDOR' | 'RETAIL';
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}
