import type { SupportTicketStatus } from '@prisma/client';
import { VENDOR_REPLYABLE_STATUSES } from '../../services/support/support.constants.js';
import type {
  SupportAttachmentDto,
  SupportEventDto,
  SupportMessageDto,
} from './support.types.js';

type MediaMap = Map<string, { url: string | null; thumbnailUrl: string | null }>;

interface AttachmentRecord {
  id: string;
  kind: SupportAttachmentDto['kind'];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export function mapAttachment(attachment: AttachmentRecord, media: MediaMap): SupportAttachmentDto {
  const links = media.get(attachment.id);
  return {
    id: attachment.id,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: links?.url ?? null,
    thumbnailUrl: links?.thumbnailUrl ?? null,
    createdAt: attachment.createdAt.toISOString(),
  };
}

export function mapMessage(
  message: {
    id: string;
    authorType: string;
    isInternal: boolean;
    body: string;
    createdAt: Date;
    author: { firstName: string; lastName: string } | null;
    attachments: AttachmentRecord[];
  },
  media: MediaMap,
): SupportMessageDto {
  return {
    id: message.id,
    authorType: message.authorType,
    // The desk speaks as one voice to the vendor: an individual operator's name adds nothing and
    // invites the vendor to chase a person instead of the ticket.
    authorName:
      message.authorType === 'SYSTEM'
        ? 'System'
        : message.authorType === 'STAFF'
          ? 'Support team'
          : message.author
            ? `${message.author.firstName} ${message.author.lastName}`
            : 'You',
    isInternal: message.isInternal,
    body: message.body,
    attachments: message.attachments.map((attachment) => mapAttachment(attachment, media)),
    createdAt: message.createdAt.toISOString(),
  };
}

export function mapEvent(event: {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  createdAt: Date;
  actor: { firstName: string; lastName: string } | null;
}): SupportEventDto {
  return {
    id: event.id,
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    actorName: event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : null,
    createdAt: event.createdAt.toISOString(),
  };
}

export function vendorCanReply(status: SupportTicketStatus): boolean {
  return (VENDOR_REPLYABLE_STATUSES as readonly string[]).includes(status);
}

/** A ticket is overdue when the desk has not replied and the SLA clock has run out. */
export function isOverdue(ticket: {
  slaDueAt: Date | null;
  firstRespondedAt: Date | null;
  status: SupportTicketStatus;
}): boolean {
  if (!ticket.slaDueAt || ticket.firstRespondedAt) return false;
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' || ticket.status === 'REJECTED') return false;
  return ticket.slaDueAt.getTime() < Date.now();
}
