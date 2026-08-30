import { Prisma, SupportMessageAuthorType, SupportTicketStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { formatVendorCodeDisplay } from '../../constants/vendor-code.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { notifyUser } from '../orders/order-events.service.js';
import {
  reprintOrderService,
  supportSettingsService,
  supportTicketService,
  SUPPORT_EVENTS,
  SUPPORT_NOTIFICATIONS,
} from '../../services/support/index.js';
import { mapAttachment, mapEvent, mapMessage, isOverdue } from '../support/support.utils.js';
import type { SupportTicketDetailDto } from '../support/support.types.js';
import type {
  ApproveReprintInput,
  AssignInput,
  QueueQuery,
  RaiseOnBehalfInput,
  RejectInput,
  ResolveInput,
  StaffReplyInput,
  StatsQuery,
  SupportSettingsInput,
  UpdateTicketInput,
} from './admin-support.validation.js';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * The support desk.
 *
 * Written so the eventual standalone support panel is a routing change and nothing more: every
 * method takes the acting user's id and no method assumes an admin context, so the same service
 * backs an ADMIN using the admin portal today and a SUPPORT operator using their own portal
 * tomorrow. The permission difference lives entirely in the route file's role list.
 */
export class AdminSupportService {
  // ── Queue ─────────────────────────────────────────────────────────────────

  async queue(query: QueueQuery) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.priority && { priority: query.priority }),
      ...(query.vendorUserId && { vendorUserId: query.vendorUserId }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.unassignedOnly && { assignedToId: null }),
      ...(query.overdueOnly && {
        firstRespondedAt: null,
        slaDueAt: { lt: new Date() },
        status: { notIn: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED, SupportTicketStatus.REJECTED] },
      }),
      ...((query.from ?? query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { ticketNumber: { contains: query.search, mode: 'insensitive' as const } },
          { subject: { contains: query.search, mode: 'insensitive' as const } },
          { order: { orderNumber: { contains: query.search, mode: 'insensitive' as const } } },
          { vendorUser: { vendorProfile: { businessName: { contains: query.search, mode: 'insensitive' as const } } } },
        ],
      }),
    };

    const orderBy: Prisma.SupportTicketOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : query.sort === 'priority'
          ? [{ priority: 'desc' }, { createdAt: 'asc' }]
          : query.sort === 'sla'
            ? [{ slaDueAt: 'asc' }]
            : [{ updatedAt: 'desc' }];

    const [tickets, total, byStatus, byType] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          order: { select: { id: true, orderNumber: true } },
          reprintOrder: { select: { id: true, orderNumber: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          vendorUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              vendorProfile: { select: { businessName: true, vendorCode: true } },
            },
          },
          retailCustomer: { select: { id: true, name: true, phone: true } },
          _count: { select: { attachments: true, messages: true } },
        },
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.supportTicket.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);

    return {
      data: tickets.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: ticket.type,
        category: ticket.category,
        status: ticket.status,
        priority: ticket.priority,
        channel: ticket.channel,
        subject: ticket.subject,
        orderId: ticket.orderId,
        orderNumber: ticket.order?.orderNumber ?? null,
        reprintOrderId: ticket.reprintOrderId,
        reprintOrderNumber: ticket.reprintOrder?.orderNumber ?? null,
        attachmentCount: ticket._count.attachments,
        messageCount: ticket._count.messages,
        assignedToId: ticket.assignedToId,
        assignedToName: ticket.assignedTo
          ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
          : null,
        vendorUserId: ticket.vendorUserId,
        vendorName:
          ticket.vendorUser?.vendorProfile?.businessName ??
          (ticket.vendorUser ? `${ticket.vendorUser.firstName} ${ticket.vendorUser.lastName}` : null) ??
          ticket.retailCustomer?.name ??
          null,
        vendorCode: formatVendorCodeDisplay(ticket.vendorUser?.vendorProfile?.vendorCode),
        vendorPhone: ticket.vendorUser?.phone ?? ticket.retailCustomer?.phone ?? null,
        isOverdue: isOverdue(ticket),
        slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
        firstRespondedAt: ticket.firstRespondedAt?.toISOString() ?? null,
        lastActivityAt: ticket.updatedAt.toISOString(),
        createdAt: ticket.createdAt.toISOString(),
      })),
      counts: {
        byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
        byType: Object.fromEntries(byType.map((row) => [row.type, row._count._all])),
      },
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) || 1 },
    };
  }

  async getTicket(ticketId: string): Promise<SupportTicketDetailDto> {
    const { ticket, media } = await supportTicketService.getTicket(ticketId, { includeInternal: true });

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
      decidedByName: ticket.decidedBy ? `${ticket.decidedBy.firstName} ${ticket.decidedBy.lastName}` : null,
      decidedAt: ticket.decidedAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
      satisfactionRating: ticket.satisfactionRating,
      eligibilitySnapshot: ticket.eligibilitySnapshot as Record<string, unknown>,
      attachmentCount: ticket.attachments.length,
      messageCount: ticket.messages.length,
      assignedToId: ticket.assignedToId,
      assignedToName: ticket.assignedTo
        ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
        : null,
      vendorName:
        ticket.vendorUser?.vendorProfile?.businessName ??
        (ticket.vendorUser ? `${ticket.vendorUser.firstName} ${ticket.vendorUser.lastName}` : null) ??
        ticket.retailCustomer?.name ??
        null,
      vendorCode: formatVendorCodeDisplay(ticket.vendorUser?.vendorProfile?.vendorCode),
      isOverdue: isOverdue(ticket),
      lastActivityAt: ticket.updatedAt.toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      internalNotes: ticket.internalNotes,
      customer: ticket.vendorUser
        ? {
            kind: 'VENDOR',
            id: ticket.vendorUser.id,
            name: ticket.vendorUser.vendorProfile?.businessName ??
              `${ticket.vendorUser.firstName} ${ticket.vendorUser.lastName}`,
            code: formatVendorCodeDisplay(ticket.vendorUser.vendorProfile?.vendorCode),
            phone: ticket.vendorUser.phone,
            email: ticket.vendorUser.email,
          }
        : ticket.retailCustomer
          ? {
              kind: 'RETAIL',
              id: ticket.retailCustomer.id,
              name: ticket.retailCustomer.name,
              code: null,
              phone: ticket.retailCustomer.phone,
              email: null,
            }
          : null,
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
      canReply: true,
    };
  }

  // ── Working a ticket ──────────────────────────────────────────────────────

  async reply(ticketId: string, staffUserId: string, input: StaffReplyInput) {
    await supportTicketService.addMessage({
      ticketId,
      authorType: SupportMessageAuthorType.STAFF,
      authorUserId: staffUserId,
      body: input.body,
      isInternal: input.isInternal,
      attachments: input.attachments,
    });

    if (input.requestsInformation && !input.isInternal) {
      await this.transition(ticketId, SupportTicketStatus.AWAITING_CUSTOMER, staffUserId, {
        eventType: SUPPORT_EVENTS.INFO_REQUESTED,
        title: 'More information requested',
        notify: {
          type: SUPPORT_NOTIFICATIONS.INFO_REQUESTED,
          title: 'We need a bit more information',
          body: input.body.slice(0, 160),
        },
      });
    } else if (!input.isInternal) {
      // A first public reply moves an untouched ticket out of the unread pile.
      await prisma.supportTicket.updateMany({
        where: { id: ticketId, status: SupportTicketStatus.OPEN },
        data: { status: SupportTicketStatus.UNDER_REVIEW },
      });
    }

    return this.getTicket(ticketId);
  }

  async assign(ticketId: string, staffUserId: string, input: AssignInput) {
    const assignee = input.assignedToId
      ? await prisma.user.findUnique({
          where: { id: input.assignedToId },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;

    if (input.assignedToId && !assignee) throw ApiError.badRequest('That user no longer exists');

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { assignedToId: input.assignedToId },
      });
      await supportTicketService.recordEvent(
        ticketId,
        {
          eventType: SUPPORT_EVENTS.ASSIGNED,
          title: assignee ? `Assigned to ${assignee.firstName} ${assignee.lastName}` : 'Unassigned',
          actorId: staffUserId,
          // Who is handling it internally is not the vendor's concern.
          isCustomerVisible: false,
        },
        tx,
      );
    });

    return this.getTicket(ticketId);
  }

  async update(ticketId: string, staffUserId: string, input: UpdateTicketInput) {
    const before = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { priority: true, status: true, category: true },
    });
    if (!before) throw ApiError.notFound('Ticket not found');

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          ...(input.priority && { priority: input.priority }),
          ...(input.category && { category: input.category }),
          ...(input.status && { status: input.status }),
          ...(input.internalNotes !== undefined && { internalNotes: input.internalNotes }),
        },
      });

      if (input.priority && input.priority !== before.priority) {
        await supportTicketService.recordEvent(
          ticketId,
          {
            eventType: SUPPORT_EVENTS.PRIORITY_CHANGED,
            title: `Priority set to ${input.priority.toLowerCase()}`,
            actorId: staffUserId,
            isCustomerVisible: false,
          },
          tx,
        );
      }
      if (input.status && input.status !== before.status) {
        await supportTicketService.recordEvent(
          ticketId,
          {
            eventType: SUPPORT_EVENTS.STATUS_CHANGED,
            title: `Status changed to ${input.status.replace(/_/g, ' ').toLowerCase()}`,
            actorId: staffUserId,
          },
          tx,
        );
      }
    });

    return this.getTicket(ticketId);
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  /**
   * Approves a reprint and — unless the approver chose to hold it — creates the replacement order
   * in the same action.
   *
   * Approval and order creation are one step by default on purpose. Splitting them produces the
   * failure this whole module exists to prevent: a ticket marked "approved" that nobody turned
   * into an actual job, discovered by the vendor a week later.
   */
  async approveReprint(ticketId: string, staffUserId: string, input: ApproveReprintInput) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        type: true,
        status: true,
        orderId: true,
        vendorUserId: true,
        reprintOrderId: true,
        requestedQuantity: true,
      },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');
    if (ticket.type !== 'REPRINT') throw ApiError.badRequest('This ticket is not a reprint request');
    if (!ticket.orderId) throw ApiError.badRequest('This reprint request has no order attached');
    if (ticket.reprintOrderId) throw ApiError.badRequest('A reprint order already exists for this ticket');
    if (ticket.status === SupportTicketStatus.REJECTED) {
      throw ApiError.badRequest('This request was rejected. Reopen it before approving.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: SupportTicketStatus.APPROVED,
          decisionRemarks: input.remarks.trim(),
          decidedById: staffUserId,
          decidedAt: new Date(),
          reprintChargeAmount: new Prisma.Decimal(round2(input.chargeAmount)),
        },
      });
      await supportTicketService.recordEvent(
        ticket.id,
        {
          eventType: SUPPORT_EVENTS.REPRINT_APPROVED,
          title: 'Reprint approved',
          description: input.remarks.trim(),
          actorId: staffUserId,
          metadata: { chargeAmount: round2(input.chargeAmount) },
        },
        tx,
      );
    });

    let reprintOrder: Awaited<ReturnType<typeof reprintOrderService.create>> | null = null;
    if (input.createOrderNow) {
      reprintOrder = await reprintOrderService.create({
        ticketId: ticket.id,
        originalOrderId: ticket.orderId,
        quantity: input.quantity ?? ticket.requestedQuantity ?? null,
        chargeAmount: input.chargeAmount,
        createdById: staffUserId,
        reason: input.remarks,
        copyArtwork: input.copyArtwork,
      });

      await supportTicketService.recordEvent(ticket.id, {
        eventType: SUPPORT_EVENTS.REPRINT_ORDER_CREATED,
        title: `Reprint order ${reprintOrder.orderNumber} created`,
        description:
          input.chargeAmount === 0
            ? 'No charge — replacement under the reprint policy.'
            : `Charged ₹${round2(input.chargeAmount).toFixed(2)}`,
        actorId: staffUserId,
        metadata: { reprintOrderId: reprintOrder.id, reprintOrderNumber: reprintOrder.orderNumber },
      });
    }

    if (ticket.vendorUserId) {
      await notifyUser(ticket.vendorUserId, {
        type: SUPPORT_NOTIFICATIONS.REPRINT_APPROVED,
        title: `Reprint approved — ${ticket.ticketNumber}`,
        body: reprintOrder
          ? `We are reprinting your job. Track it as order ${reprintOrder.orderNumber}.`
          : 'Your reprint has been approved. We will confirm the new order shortly.',
        entityType: 'support_ticket',
        entityId: ticket.id,
      });
    }

    return this.getTicket(ticketId);
  }

  async reject(ticketId: string, staffUserId: string, input: RejectInput) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, ticketNumber: true, vendorUserId: true, reprintOrderId: true },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');
    if (ticket.reprintOrderId) {
      throw ApiError.badRequest('A reprint order was already created — cancel that order instead of rejecting.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: SupportTicketStatus.REJECTED,
          decisionRemarks: input.remarks.trim(),
          decidedById: staffUserId,
          decidedAt: new Date(),
          resolvedAt: new Date(),
        },
      });
      await supportTicketService.recordEvent(
        ticket.id,
        {
          eventType: SUPPORT_EVENTS.REPRINT_REJECTED,
          title: 'Request declined',
          // The reason is always shown to the vendor — a decline without one is how a business
          // loses a customer over a ₹2,000 job.
          description: input.remarks.trim(),
          actorId: staffUserId,
        },
        tx,
      );
    });

    if (ticket.vendorUserId) {
      await notifyUser(ticket.vendorUserId, {
        type: SUPPORT_NOTIFICATIONS.REPRINT_REJECTED,
        title: `Update on ${ticket.ticketNumber}`,
        body: input.remarks.trim().slice(0, 160),
        entityType: 'support_ticket',
        entityId: ticket.id,
      });
    }

    return this.getTicket(ticketId);
  }

  async resolve(ticketId: string, staffUserId: string, input: ResolveInput) {
    await this.transition(ticketId, SupportTicketStatus.RESOLVED, staffUserId, {
      eventType: SUPPORT_EVENTS.RESOLVED,
      title: 'Marked as resolved',
      description: input.remarks?.trim(),
      notify: {
        type: SUPPORT_NOTIFICATIONS.RESOLVED,
        title: 'Your request has been resolved',
        body: input.remarks?.trim() ?? 'Let us know if anything is still not right.',
      },
      extraData: { resolvedAt: new Date() },
    });
    return this.getTicket(ticketId);
  }

  async close(ticketId: string, staffUserId: string) {
    await this.transition(ticketId, SupportTicketStatus.CLOSED, staffUserId, {
      eventType: SUPPORT_EVENTS.CLOSED,
      title: 'Ticket closed',
      extraData: { closedAt: new Date() },
    });
    return this.getTicket(ticketId);
  }

  async reopen(ticketId: string, staffUserId: string) {
    await this.transition(ticketId, SupportTicketStatus.UNDER_REVIEW, staffUserId, {
      eventType: SUPPORT_EVENTS.REOPENED,
      title: 'Ticket reopened',
      extraData: { resolvedAt: null, closedAt: null },
    });
    return this.getTicket(ticketId);
  }

  /** Staff raising a ticket for a customer who phoned in. */
  async raiseOnBehalf(staffUserId: string, input: RaiseOnBehalfInput) {
    const ticket = await supportTicketService.raise({
      type: input.type,
      category: input.category,
      channel: input.channel,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      orderId: input.orderId ?? null,
      requestedQuantity: input.requestedQuantity ?? null,
      attachments: input.attachments,
      vendorUserId: input.vendorUserId ?? null,
      retailCustomerId: input.retailCustomerId ?? null,
      raisedById: staffUserId,
    });
    return this.getTicket(ticket.id);
  }

  // ── Settings & stats ──────────────────────────────────────────────────────

  async getSettings() {
    return supportSettingsService.get();
  }

  async updateSettings(input: SupportSettingsInput, userId: string) {
    return supportSettingsService.update({
      ...(input.reprintWindowDays !== undefined && { reprintWindowDays: input.reprintWindowDays }),
      ...(input.reprintRequiresDispatch !== undefined && { reprintRequiresDispatch: input.reprintRequiresDispatch }),
      ...(input.responseSlaHours !== undefined && { responseSlaHours: input.responseSlaHours }),
      ...(input.maxAttachmentsPerTicket !== undefined && { maxAttachmentsPerTicket: input.maxAttachmentsPerTicket }),
      ...(input.maxImageSizeMb !== undefined && { maxImageSizeMb: input.maxImageSizeMb }),
      ...(input.maxVideoSizeMb !== undefined && { maxVideoSizeMb: input.maxVideoSizeMb }),
      ...(input.autoCloseResolvedAfterDays !== undefined && {
        autoCloseResolvedAfterDays: input.autoCloseResolvedAfterDays,
      }),
      ...(input.reprintFreeByDefault !== undefined && { reprintFreeByDefault: input.reprintFreeByDefault }),
      ...(input.supportPhone !== undefined && { supportPhone: input.supportPhone }),
      ...(input.supportEmail !== undefined && { supportEmail: input.supportEmail }),
      ...(input.supportHours !== undefined && { supportHours: input.supportHours }),
      ...(input.reprintPolicyContent !== undefined && {
        reprintPolicyContent: input.reprintPolicyContent as Prisma.InputJsonValue,
      }),
      updatedBy: { connect: { id: userId } },
    });
  }

  /**
   * Desk performance and — more usefully — what the complaints are actually about. A month of
   * PRINT_QUALITY tickets concentrated on one product says something no order report will.
   */
  async stats(query: StatsQuery) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getFullYear(), to.getMonth(), 1);
    const range = { gte: from, lte: to };

    const [byCategory, byType, byStatus, resolvedTickets, openCount, overdueCount, ratings, topVendors] =
      await Promise.all([
        prisma.supportTicket.groupBy({ by: ['category'], where: { createdAt: range }, _count: { _all: true } }),
        prisma.supportTicket.groupBy({ by: ['type'], where: { createdAt: range }, _count: { _all: true } }),
        prisma.supportTicket.groupBy({ by: ['status'], where: { createdAt: range }, _count: { _all: true } }),
        prisma.supportTicket.findMany({
          where: { createdAt: range, resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true, firstRespondedAt: true },
        }),
        prisma.supportTicket.count({
          where: { status: { notIn: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED, SupportTicketStatus.REJECTED] } },
        }),
        prisma.supportTicket.count({
          where: {
            firstRespondedAt: null,
            slaDueAt: { lt: new Date() },
            status: { notIn: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED, SupportTicketStatus.REJECTED] },
          },
        }),
        prisma.supportTicket.aggregate({
          where: { createdAt: range, satisfactionRating: { not: null } },
          _avg: { satisfactionRating: true },
          _count: { satisfactionRating: true },
        }),
        prisma.supportTicket.groupBy({
          by: ['vendorUserId'],
          where: { createdAt: range, vendorUserId: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { vendorUserId: 'desc' } },
          take: 10,
        }),
      ]);

    const avgHours = (pick: (t: (typeof resolvedTickets)[number]) => Date | null): number => {
      const values = resolvedTickets
        .map((ticket) => {
          const end = pick(ticket);
          return end ? (end.getTime() - ticket.createdAt.getTime()) / 3_600_000 : null;
        })
        .filter((value): value is number => value !== null);
      if (values.length === 0) return 0;
      return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
    };

    const vendorIds = topVendors.map((row) => row.vendorUserId).filter((id): id is string => id !== null);
    const vendors = vendorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true, firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } },
        })
      : [];
    const vendorNames = new Map(
      vendors.map((vendor) => [
        vendor.id,
        vendor.vendorProfile?.businessName ?? `${vendor.firstName} ${vendor.lastName}`,
      ]),
    );

    const reprintOrders = await prisma.productionOrder.aggregate({
      where: { isReprint: true, createdAt: range },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        raised: byType.reduce((sum, row) => sum + row._count._all, 0),
        open: openCount,
        overdue: overdueCount,
        resolved: resolvedTickets.length,
        averageFirstResponseHours: avgHours((ticket) => ticket.firstRespondedAt),
        averageResolutionHours: avgHours((ticket) => ticket.resolvedAt),
        averageRating: round2(ratings._avg.satisfactionRating ?? 0),
        ratingCount: ratings._count.satisfactionRating,
      },
      reprints: {
        ordersCreated: reprintOrders._count._all,
        /** What the reprints cost the business — nearly always zero revenue against real production. */
        chargedValue: round2(Number(reprintOrders._sum.totalAmount ?? 0)),
      },
      byType: byType.map((row) => ({ key: row.type, count: row._count._all })),
      byStatus: byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      byCategory: byCategory
        .map((row) => ({ key: row.category, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      topVendors: topVendors.map((row) => ({
        vendorUserId: row.vendorUserId,
        vendorName: row.vendorUserId ? (vendorNames.get(row.vendorUserId) ?? 'Unknown') : 'Unknown',
        count: row._count._all,
      })),
    };
  }

  /** The desk roster — who a ticket can be assigned to. */
  async agents() {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT'] } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: { select: { name: true } },
        _count: {
          select: {
            supportTicketsAssigned: {
              where: {
                status: {
                  notIn: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED, SupportTicketStatus.REJECTED],
                },
              },
            },
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role.name,
      openTickets: user._count.supportTicketsAssigned,
    }));
  }

  /** Shared status-change plumbing: update, log, and tell the vendor, in one transaction. */
  private async transition(
    ticketId: string,
    status: SupportTicketStatus,
    staffUserId: string,
    options: {
      eventType: string;
      title: string;
      description?: string;
      isCustomerVisible?: boolean;
      notify?: { type: string; title: string; body: string };
      extraData?: Prisma.SupportTicketUpdateInput;
    },
  ): Promise<void> {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, ticketNumber: true, vendorUserId: true },
    });
    if (!ticket) throw ApiError.notFound('Ticket not found');

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status, ...options.extraData },
      });
      await supportTicketService.recordEvent(
        ticketId,
        {
          eventType: options.eventType,
          title: options.title,
          description: options.description,
          actorId: staffUserId,
          isCustomerVisible: options.isCustomerVisible ?? true,
        },
        tx,
      );
    });

    if (options.notify && ticket.vendorUserId) {
      await notifyUser(ticket.vendorUserId, {
        type: options.notify.type,
        title: options.notify.title,
        body: options.notify.body,
        entityType: 'support_ticket',
        entityId: ticketId,
      });
    }
  }
}

export const adminSupportService = new AdminSupportService();
