import {
  Prisma,
  SupportMessageAuthorType,
  SupportTicketStatus,
  type SupportAttachmentKind,
  type SupportTicketCategory,
  type SupportTicketChannel,
  type SupportTicketPriority,
  type SupportTicketType,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { logger } from '../../logs/logger.js';
import { notifyUser } from '../../modules/orders/order-events.service.js';
import { allocateTicketNumber } from './ticket-number.service.js';
import { reprintEligibilityService } from './reprint-eligibility.service.js';
import { supportAttachmentService } from './support-attachment.service.js';
import { supportSettingsService } from './support-settings.service.js';
import { SUPPORT_EVENTS, SUPPORT_NOTIFICATIONS } from './support.constants.js';

export interface AttachmentInput {
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: SupportAttachmentKind;
}

export interface RaiseTicketInput {
  type: SupportTicketType;
  category?: SupportTicketCategory;
  subject: string;
  description: string;
  orderId?: string | null;
  requestedQuantity?: number | null;
  attachments?: AttachmentInput[];
  channel?: SupportTicketChannel;
  priority?: SupportTicketPriority;
  /** Whose ticket it is. */
  vendorUserId?: string | null;
  retailCustomerId?: string | null;
  /** Who pressed the button — the vendor, or the staff member taking the call. */
  raisedById: string;
}

const TICKET_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * The ticket lifecycle, shared by the vendor portal and the support desk.
 *
 * Both sides read and write the same tickets, so the rules that decide what a ticket *is* live
 * here rather than in either module: how it is numbered, what a reprint must satisfy to be
 * accepted, what the timeline records, and — the one that matters most for trust — which parts of
 * a ticket a vendor is allowed to see. Internal notes and staff-only messages are filtered in the
 * query, not in the response mapper and certainly not in the UI, so there is no code path that can
 * leak them by forgetting a flag.
 */
export class SupportTicketService {
  // ── Raising ───────────────────────────────────────────────────────────────

  async raise(input: RaiseTicketInput) {
    if (!input.vendorUserId && !input.retailCustomerId) {
      throw ApiError.badRequest('A ticket must belong to a vendor or a walk-in customer');
    }

    const settings = await supportSettingsService.get();
    let eligibilitySnapshot: Prisma.InputJsonValue = {};

    if (input.type === 'REPRINT') {
      if (!input.orderId) {
        throw ApiError.badRequest('A reprint request needs the order number it relates to');
      }
      // Re-checked here rather than trusting the client's earlier check: the window may have
      // lapsed between the vendor loading the form and submitting it, and a client-side gate is
      // not a rule.
      const eligibility = await reprintEligibilityService.check(input.orderId, input.vendorUserId ?? null);
      if (!eligibility.eligible) {
        throw ApiError.badRequest(eligibility.message);
      }
      eligibilitySnapshot = {
        checkedAt: new Date().toISOString(),
        windowDays: eligibility.window.days,
        requiresDispatch: eligibility.window.requiresDispatch,
        daysSinceDispatch: eligibility.window.daysSinceDispatch,
        daysRemaining: eligibility.window.daysRemaining,
        dispatchedAt: eligibility.order?.dispatchedAt ?? null,
        orderNumber: eligibility.order?.orderNumber ?? null,
        orderQuantity: eligibility.order?.quantity ?? null,
        orderTotal: eligibility.order?.totalAmount ?? null,
      };
    }

    const attachments = input.attachments ?? [];
    if (attachments.length > settings.maxAttachmentsPerTicket) {
      throw ApiError.badRequest(
        `Please attach at most ${String(settings.maxAttachmentsPerTicket)} files.`,
      );
    }

    const slaDueAt = new Date(Date.now() + settings.responseSlaHours * 3_600_000);

    const ticket = await prisma.$transaction(async (tx) => {
      const ticketNumber = await allocateTicketNumber(tx);

      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          type: input.type,
          category: input.category ?? (input.type === 'REPRINT' ? 'PRINT_QUALITY' : 'OTHER'),
          status: SupportTicketStatus.OPEN,
          priority: input.priority ?? 'NORMAL',
          channel: input.channel ?? 'VENDOR_PORTAL',
          vendorUserId: input.vendorUserId ?? null,
          retailCustomerId: input.retailCustomerId ?? null,
          raisedById: input.raisedById,
          orderId: input.orderId ?? null,
          subject: input.subject.trim(),
          description: input.description.trim(),
          requestedQuantity: input.requestedQuantity ?? null,
          eligibilitySnapshot,
          slaDueAt,
          reprintChargeAmount: new Prisma.Decimal(0),
        },
      });

      // The opening description is stored as the first message too, so the thread reads as one
      // conversation from the top rather than a description followed by a disconnected reply.
      const firstMessage = await tx.supportTicketMessage.create({
        data: {
          ticketId: created.id,
          authorType: SupportMessageAuthorType.VENDOR,
          authorUserId: input.raisedById,
          body: input.description.trim(),
        },
      });

      if (attachments.length > 0) {
        await tx.supportTicketAttachment.createMany({
          data: attachments.map((attachment) => ({
            ticketId: created.id,
            messageId: firstMessage.id,
            kind: attachment.kind,
            fileName: attachment.fileName,
            fileKey: attachment.fileKey,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            uploadedById: input.raisedById,
          })),
        });
      }

      await tx.supportTicketEvent.create({
        data: {
          ticketId: created.id,
          eventType: SUPPORT_EVENTS.TICKET_RAISED,
          title: input.type === 'REPRINT' ? 'Reprint request raised' : 'Complaint raised',
          description: input.subject.trim(),
          actorId: input.raisedById,
          metadata: { ticketNumber, attachmentCount: attachments.length },
        },
      });

      return created;
    }, TICKET_TX_OPTIONS);

    await this.notifyDesk(ticket.id, ticket.ticketNumber, ticket.type, ticket.subject);

    logger.info('Support ticket raised', {
      ticketNumber: ticket.ticketNumber,
      type: ticket.type,
      orderId: ticket.orderId,
    });

    return ticket;
  }

  // ── Conversation ──────────────────────────────────────────────────────────

  async addMessage(input: {
    ticketId: string;
    authorType: SupportMessageAuthorType;
    authorUserId: string;
    body: string;
    isInternal?: boolean;
    attachments?: AttachmentInput[];
  }) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, ticketNumber: true, status: true, vendorUserId: true, firstRespondedAt: true },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');

    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw ApiError.badRequest('This ticket is closed. Please raise a new one if the problem is back.');
    }

    if (input.attachments?.length) {
      await supportAttachmentService.assertWithinAttachmentLimit(ticket.id, input.attachments.length);
    }

    const isStaff = input.authorType === SupportMessageAuthorType.STAFF;

    return prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorType: input.authorType,
          authorUserId: input.authorUserId,
          body: input.body.trim(),
          isInternal: input.isInternal ?? false,
        },
      });

      if (input.attachments?.length) {
        await tx.supportTicketAttachment.createMany({
          data: input.attachments.map((attachment) => ({
            ticketId: ticket.id,
            messageId: message.id,
            kind: attachment.kind,
            fileName: attachment.fileName,
            fileKey: attachment.fileKey,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            uploadedById: input.authorUserId,
          })),
        });
      }

      // A public staff reply is what stops the response-time clock; an internal note is not a
      // reply to anyone.
      const isFirstPublicStaffReply = isStaff && !input.isInternal && !ticket.firstRespondedAt;

      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          ...(isFirstPublicStaffReply ? { firstRespondedAt: new Date() } : {}),
          // A vendor answering a question puts the ticket back in the desk's court.
          ...(input.authorType === SupportMessageAuthorType.VENDOR &&
          ticket.status === SupportTicketStatus.AWAITING_CUSTOMER
            ? { status: SupportTicketStatus.UNDER_REVIEW }
            : {}),
          updatedAt: new Date(),
        },
      });

      if (!input.isInternal) {
        await tx.supportTicketEvent.create({
          data: {
            ticketId: ticket.id,
            eventType: isStaff ? SUPPORT_EVENTS.STAFF_REPLIED : SUPPORT_EVENTS.MESSAGE_ADDED,
            title: isStaff ? 'Our team replied' : 'You replied',
            actorId: input.authorUserId,
            isCustomerVisible: true,
          },
        });
      }

      if (isStaff && !input.isInternal && ticket.vendorUserId) {
        await notifyUser(
          ticket.vendorUserId,
          {
            type: SUPPORT_NOTIFICATIONS.STAFF_REPLIED,
            title: `Reply on ${ticket.ticketNumber}`,
            body: input.body.trim().slice(0, 160),
            entityType: 'support_ticket',
            entityId: ticket.id,
          },
          tx,
        );
      }

      return message;
    }, TICKET_TX_OPTIONS);
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  /**
   * One ticket, rendered for whoever is asking.
   *
   * `includeInternal` is the single switch that separates the two audiences, and it is applied to
   * the database query rather than to the result — a vendor's request never loads an internal
   * note into memory in the first place.
   */
  async getTicket(ticketId: string, options: { vendorUserId?: string | null; includeInternal: boolean }) {
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        ...(options.vendorUserId ? { vendorUserId: options.vendorUserId } : {}),
      },
      include: {
        order: {
          select: { id: true, orderNumber: true, orderName: true, status: true, totalAmount: true, createdAt: true },
        },
        reprintOrder: {
          select: { id: true, orderNumber: true, orderName: true, status: true, createdAt: true, estimatedCompletionAt: true },
        },
        vendorUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            vendorProfile: { select: { businessName: true, vendorCode: true } },
          },
        },
        retailCustomer: { select: { id: true, name: true, phone: true } },
        raisedBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        decidedBy: { select: { id: true, firstName: true, lastName: true } },
        messages: {
          where: options.includeInternal ? {} : { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
            attachments: true,
          },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
        events: {
          where: options.includeInternal ? {} : { isCustomerVisible: true },
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    if (!ticket) throw ApiError.notFound('Ticket not found');

    const media = await supportAttachmentService.presignAttachments(ticket.attachments);

    return { ticket, media, includeInternal: options.includeInternal };
  }

  async assertVendorOwns(ticketId: string, vendorUserId: string): Promise<void> {
    const owned = await prisma.supportTicket.count({ where: { id: ticketId, vendorUserId } });
    if (owned === 0) throw ApiError.notFound('Ticket not found');
  }

  // ── Timeline & status ─────────────────────────────────────────────────────

  // Not `async`: it returns the Prisma promise straight through, so callers can await it or hand
  // it to a transaction without an extra microtask in between.
  recordEvent(
    ticketId: string,
    event: {
      eventType: string;
      title: string;
      description?: string;
      actorId?: string | null;
      isCustomerVisible?: boolean;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? prisma;
    return db.supportTicketEvent.create({
      data: {
        ticketId,
        eventType: event.eventType,
        title: event.title,
        description: event.description ?? null,
        actorId: event.actorId ?? null,
        isCustomerVisible: event.isCustomerVisible ?? true,
        metadata: event.metadata ?? {},
      },
    });
  }

  /** Everyone on the desk hears about a new ticket — there is no assignment yet to notify. */
  private async notifyDesk(ticketId: string, ticketNumber: string, type: string, subject: string): Promise<void> {
    try {
      const deskUsers = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT'] } },
        },
        select: { id: true },
        take: 50,
      });

      await Promise.all(
        deskUsers.map((user) =>
          notifyUser(user.id, {
            type: SUPPORT_NOTIFICATIONS.TICKET_RAISED,
            title: `New ${type === 'REPRINT' ? 'reprint request' : 'complaint'} — ${ticketNumber}`,
            body: subject,
            entityType: 'support_ticket',
            entityId: ticketId,
          }),
        ),
      );
    } catch (error) {
      // A notification failure must never lose the vendor's complaint — the ticket is already
      // committed, and the desk sees it in the queue regardless.
      logger.warn('Could not notify the support desk about a new ticket', {
        ticketNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const supportTicketService = new SupportTicketService();
