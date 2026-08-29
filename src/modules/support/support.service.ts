import { Prisma, SupportMessageAuthorType, SupportTicketStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  reprintEligibilityService,
  supportAttachmentService,
  supportSettingsService,
  supportTicketService,
  SUPPORT_EVENTS,
} from '../../services/support/index.js';
import { mapAttachment, mapEvent, mapMessage, vendorCanReply } from './support.utils.js';
import type { SupportTicketDetailDto, SupportTicketSummaryDto } from './support.types.js';
import type {
  ListMyTicketsQuery,
  RaiseComplaintInput,
  RaiseReprintInput,
  RateTicketInput,
  ReplyInput,
  UploadTicketInput,
} from './support.validation.js';

/**
 * The vendor's side of the support desk.
 *
 * Every method here is scoped to the calling vendor at the query level — there is no method that
 * takes a ticket id without also taking the vendor's own id. That is deliberate: ticket ids are
 * guessable enough that "check ownership afterwards" is a bug waiting to be introduced by the next
 * person who adds an endpoint.
 */
export class SupportService {
  /** What the vendor sees before typing anything: is this order still reprintable? */
  async checkReprintEligibility(vendorUserId: string, query: { orderId?: string; orderNumber?: string }) {
    if (query.orderId) return reprintEligibilityService.check(query.orderId, vendorUserId);
    return reprintEligibilityService.checkByOrderNumber(query.orderNumber ?? '', vendorUserId);
  }

  /** Policy text and contact details for the support landing page. */
  async getPublicSettings() {
    const settings = await supportSettingsService.get();
    return {
      reprintWindowDays: settings.reprintWindowDays,
      reprintRequiresDispatch: settings.reprintRequiresDispatch,
      responseSlaHours: settings.responseSlaHours,
      maxAttachmentsPerTicket: settings.maxAttachmentsPerTicket,
      maxImageSizeMb: settings.maxImageSizeMb,
      maxVideoSizeMb: settings.maxVideoSizeMb,
      supportPhone: settings.supportPhone,
      supportEmail: settings.supportEmail,
      supportHours: settings.supportHours,
      reprintPolicyContent: settings.reprintPolicyContent as Record<string, string>,
    };
  }

  async raiseReprint(vendorUserId: string, input: RaiseReprintInput) {
    const ticket = await supportTicketService.raise({
      type: 'REPRINT',
      category: input.category,
      subject: input.subject,
      description: input.description,
      orderId: input.orderId,
      requestedQuantity: input.requestedQuantity ?? null,
      attachments: input.attachments,
      vendorUserId,
      raisedById: vendorUserId,
      channel: 'VENDOR_PORTAL',
    });
    return this.getTicket(vendorUserId, ticket.id);
  }

  async raiseComplaint(vendorUserId: string, input: RaiseComplaintInput) {
    if (input.orderId) {
      // A complaint may name an order, but only the vendor's own.
      const owned = await prisma.productionOrder.count({
        where: { id: input.orderId, customerId: vendorUserId },
      });
      if (owned === 0) throw ApiError.badRequest('That order does not belong to your account');
    }

    const ticket = await supportTicketService.raise({
      type: 'OTHER',
      category: input.category,
      subject: input.subject,
      description: input.description,
      orderId: input.orderId ?? null,
      attachments: input.attachments,
      vendorUserId,
      raisedById: vendorUserId,
      channel: 'VENDOR_PORTAL',
    });
    return this.getTicket(vendorUserId, ticket.id);
  }

  async listMine(vendorUserId: string, query: ListMyTicketsQuery) {
    const where: Prisma.SupportTicketWhereInput = {
      vendorUserId,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...((query.from ?? query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { ticketNumber: { contains: query.search, mode: 'insensitive' as const } },
          { subject: { contains: query.search, mode: 'insensitive' as const } },
          { order: { orderNumber: { contains: query.search, mode: 'insensitive' as const } } },
        ],
      }),
    };

    const [tickets, total, statusCounts] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          order: { select: { id: true, orderNumber: true } },
          reprintOrder: { select: { id: true, orderNumber: true } },
          _count: { select: { attachments: true, messages: { where: { isInternal: false } } } },
        },
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.groupBy({
        by: ['status'],
        where: { vendorUserId },
        _count: { _all: true },
      }),
    ]);

    const data: SupportTicketSummaryDto[] = tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      type: ticket.type,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      subject: ticket.subject,
      orderId: ticket.orderId,
      orderNumber: ticket.order?.orderNumber ?? null,
      reprintOrderId: ticket.reprintOrderId,
      reprintOrderNumber: ticket.reprintOrder?.orderNumber ?? null,
      attachmentCount: ticket._count.attachments,
      messageCount: ticket._count.messages,
      lastActivityAt: ticket.updatedAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
    }));

    return {
      data,
      counts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async getTicket(vendorUserId: string, ticketId: string): Promise<SupportTicketDetailDto> {
    const { ticket, media } = await supportTicketService.getTicket(ticketId, {
      vendorUserId,
      includeInternal: false,
    });

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      type: ticket.type,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      subject: ticket.subject,
      description: ticket.description,
      orderId: ticket.orderId,
      orderNumber: ticket.order?.orderNumber ?? null,
      reprintOrderId: ticket.reprintOrderId,
      reprintOrderNumber: ticket.reprintOrder?.orderNumber ?? null,
      requestedQuantity: ticket.requestedQuantity,
      reprintChargeAmount: ticket.reprintChargeAmount.toNumber(),
      decisionRemarks: ticket.decisionRemarks,
      decidedByName: null,
      decidedAt: ticket.decidedAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
      satisfactionRating: ticket.satisfactionRating,
      eligibilitySnapshot: ticket.eligibilitySnapshot as Record<string, unknown>,
      attachmentCount: ticket.attachments.length,
      messageCount: ticket.messages.length,
      lastActivityAt: ticket.updatedAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      order: ticket.order
        ? {
            id: ticket.order.id,
            orderNumber: ticket.order.orderNumber,
            orderName: ticket.order.orderName,
            status: ticket.order.status,
            totalAmount: ticket.order.totalAmount.toNumber(),
            createdAt: ticket.order.createdAt.toISOString(),
          }
        : null,
      reprintOrder: ticket.reprintOrder
        ? {
            id: ticket.reprintOrder.id,
            orderNumber: ticket.reprintOrder.orderNumber,
            orderName: ticket.reprintOrder.orderName,
            status: ticket.reprintOrder.status,
            createdAt: ticket.reprintOrder.createdAt.toISOString(),
            estimatedCompletionAt: ticket.reprintOrder.estimatedCompletionAt?.toISOString() ?? null,
          }
        : null,
      messages: ticket.messages.map((message) => mapMessage(message, media)),
      events: ticket.events.map(mapEvent),
      attachments: ticket.attachments.map((attachment) => mapAttachment(attachment, media)),
      canReply: vendorCanReply(ticket.status),
    };
  }

  async reply(vendorUserId: string, ticketId: string, input: ReplyInput) {
    await supportTicketService.assertVendorOwns(ticketId, vendorUserId);
    await supportTicketService.addMessage({
      ticketId,
      authorType: SupportMessageAuthorType.VENDOR,
      authorUserId: vendorUserId,
      body: input.body,
      attachments: input.attachments,
    });
    return this.getTicket(vendorUserId, ticketId);
  }

  async requestUpload(userId: string, input: UploadTicketInput) {
    return supportAttachmentService.createUploadTicket({
      fileName: input.fileName,
      contentType: input.contentType,
      fileSize: input.fileSize,
      userId,
    });
  }

  /** Feedback once the desk has finished — asked for exactly once, and only after resolution. */
  async rate(vendorUserId: string, ticketId: string, input: RateTicketInput) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, vendorUserId },
      select: { id: true, status: true, satisfactionRating: true },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');
    if (ticket.status !== SupportTicketStatus.RESOLVED && ticket.status !== SupportTicketStatus.CLOSED) {
      throw ApiError.badRequest('You can rate a ticket once it has been resolved');
    }
    if (ticket.satisfactionRating !== null) {
      throw ApiError.badRequest('You have already rated this ticket');
    }

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { satisfactionRating: input.rating },
      });
      await supportTicketService.recordEvent(
        ticket.id,
        {
          eventType: SUPPORT_EVENTS.RATED,
          title: `Rated ${String(input.rating)} out of 5`,
          description: input.comment,
          actorId: vendorUserId,
        },
        tx,
      );
      if (input.comment?.trim()) {
        await tx.supportTicketMessage.create({
          data: {
            ticketId: ticket.id,
            authorType: SupportMessageAuthorType.VENDOR,
            authorUserId: vendorUserId,
            body: input.comment.trim(),
          },
        });
      }
    });

    return this.getTicket(vendorUserId, ticketId);
  }

  /**
   * Orders the vendor could still raise a reprint on — powers the picker on the reprint form so
   * they do not have to remember an order number.
   */
  async reprintableOrders(vendorUserId: string) {
    const settings = await supportSettingsService.get();
    const since = new Date(Date.now() - settings.reprintWindowDays * 86_400_000);

    const orders = await prisma.productionOrder.findMany({
      where: {
        customerId: vendorUserId,
        status: { in: ['DISPATCHED', 'DELIVERED'] },
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        orderName: true,
        status: true,
        totalAmount: true,
        updatedAt: true,
        items: { select: { quantity: true } },
        dispatchBatchOrder: { select: { dispatchBatch: { select: { dispatchedAt: true } } } },
        supportTickets: {
          where: { type: 'REPRINT', status: { in: ['OPEN', 'UNDER_REVIEW', 'AWAITING_CUSTOMER', 'APPROVED'] } },
          select: { id: true, ticketNumber: true },
        },
      },
    });

    return orders.map((order) => {
      const dispatchedAt = order.dispatchBatchOrder?.dispatchBatch.dispatchedAt ?? order.updatedAt;
      const daysSince = Math.floor((Date.now() - dispatchedAt.getTime()) / 86_400_000);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        status: order.status,
        quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: order.totalAmount.toNumber(),
        dispatchedAt: dispatchedAt.toISOString(),
        daysSinceDispatch: daysSince,
        daysRemaining: settings.reprintWindowDays - daysSince,
        hasOpenRequest: order.supportTickets.length > 0,
        openTicketNumber: order.supportTickets[0]?.ticketNumber ?? null,
      };
    });
  }
}

export const supportService = new SupportService();
