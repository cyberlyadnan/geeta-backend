import { DeliveryAssignmentStatus, DeliveryAttemptOutcome, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  CLOSED_ASSIGNMENT_STATUSES,
  assertAgentCanAct,
  deliveryAssignmentService,
} from '../../services/delivery/index.js';
import { storageService } from '../../services/storage/storage.service.js';
import { STORAGE_FOLDERS } from '../../services/storage/storage.types.js';
import { mapAssignmentDetail, mapAssignmentRow } from '../admin-delivery/admin-delivery.service.js';

const MAX_PROOF_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * What a delivery person can do, from their phone.
 *
 * Every method starts by resolving the caller's tagged services and ends up inside
 * `assertAgentCanAct`. That is the whole authorisation model, and it is deliberate: a delivery
 * person's reach is defined by the services they hold, re-read on every request, so untagging
 * somebody takes effect on their very next tap rather than at their next sign-in.
 *
 * Two consignments can never be worked by two people at once. Seeing is a service question —
 * anything unclaimed on my services is mine to look at. Acting is an ownership one — once
 * somebody holds it, only they can move it, because two handovers recorded for the same goods is
 * how a dispute becomes unwinnable.
 */
export class DeliveryPortalService {
  /** The services this agent is tagged with. One query, and every other method depends on it. */
  private async serviceIdsFor(userId: string): Promise<string[]> {
    const rows = await prisma.deliveryAgentService.findMany({
      where: { userId, deliveryService: { isActive: true } },
      select: { deliveryServiceId: true },
    });
    return rows.map((row) => row.deliveryServiceId);
  }

  /** The agent's own header: who they are and what they carry. */
  async me(userId: string) {
    const rows = await prisma.deliveryAgentService.findMany({
      where: { userId },
      include: {
        deliveryService: {
          select: {
            id: true,
            code: true,
            name: true,
            kind: true,
            colorHex: true,
            isActive: true,
            requiresTrackingNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const serviceIds = rows
      .filter((row) => row.deliveryService.isActive)
      .map((row) => row.deliveryServiceId);

    const [poolCount, mineCount, deliveredToday] = await Promise.all([
      serviceIds.length
        ? prisma.deliveryAssignment.count({
            where: {
              deliveryServiceId: { in: serviceIds },
              status: DeliveryAssignmentStatus.UNASSIGNED,
            },
          })
        : Promise.resolve(0),
      prisma.deliveryAssignment.count({
        where: { assignedToId: userId, status: { notIn: CLOSED_ASSIGNMENT_STATUSES } },
      }),
      prisma.deliveryAssignment.count({
        where: {
          assignedToId: userId,
          status: DeliveryAssignmentStatus.DELIVERED,
          deliveredAt: { gte: startOfToday() },
        },
      }),
    ]);

    return {
      services: rows.map((row) => row.deliveryService),
      counts: { pool: poolCount, mine: mineCount, deliveredToday },
    };
  }

  /**
   * The queue.
   *
   * `pool` is filtered by service and nothing else — that is the "shown only to the delivery
   * persons tagged with this service" rule, expressed as a where clause. An agent with no tags
   * sees an empty list rather than an error: they are a real user who simply has no work yet.
   */
  async queue(
    userId: string,
    query: { scope: 'pool' | 'mine' | 'done'; deliveryServiceId?: string; search?: string; page: number; limit: number },
  ) {
    const serviceIds = await this.serviceIdsFor(userId);
    if (query.scope === 'pool' && serviceIds.length === 0) {
      return { data: [], meta: { page: query.page, limit: query.limit, total: 0, totalPages: 1 } };
    }

    const scoped: Prisma.DeliveryAssignmentWhereInput =
      query.scope === 'pool'
        ? {
            deliveryServiceId: { in: serviceIds },
            status: DeliveryAssignmentStatus.UNASSIGNED,
          }
        : query.scope === 'mine'
          ? { assignedToId: userId, status: { notIn: CLOSED_ASSIGNMENT_STATUSES } }
          : { assignedToId: userId, status: { in: CLOSED_ASSIGNMENT_STATUSES } };

    const where: Prisma.DeliveryAssignmentWhereInput = {
      ...scoped,
      ...(query.deliveryServiceId && { deliveryServiceId: query.deliveryServiceId }),
      ...(query.search && {
        OR: [
          { trackingNumber: { contains: query.search, mode: 'insensitive' as const } },
          {
            dispatchBatch: {
              vendor: {
                vendorProfile: {
                  businessName: { contains: query.search, mode: 'insensitive' as const },
                },
              },
            },
          },
          {
            dispatchBatch: {
              invoice: { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
            },
          },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.deliveryAssignment.findMany({
        where,
        // Oldest first while working, newest first when reviewing what is done — a delivery
        // person clears the queue from the top, and reviews from the most recent.
        orderBy: query.scope === 'done' ? { deliveredAt: 'desc' } : { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: QUEUE_INCLUDE,
      }),
      prisma.deliveryAssignment.count({ where }),
    ]);

    return {
      data: rows.map(mapAssignmentRow),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  /** One consignment, with the address, the phone number and the orders inside it. */
  async get(userId: string, assignmentId: string) {
    const assignment = await deliveryAssignmentService.get(assignmentId);
    const serviceIds = await this.serviceIdsFor(userId);
    // Seeing is a service question: unclaimed or mine, either is visible.
    assertAgentCanAct({
      taggedServiceIds: serviceIds,
      deliveryServiceId: assignment.deliveryServiceId,
      assignedToId: assignment.assignedToId,
      agentUserId: userId,
    });
    return mapAssignmentDetail(assignment);
  }

  /**
   * Taking a consignment out of the shared queue.
   *
   * The claim is a conditional update — `assignedToId: null` in the where clause — so two agents
   * tapping "accept" on the same consignment at the same moment cannot both succeed. The loser
   * gets a clear message rather than a silent overwrite.
   */
  async accept(userId: string, assignmentId: string) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId === userId) return mapAssignmentDetail(assignment);

    const claimed = await prisma.deliveryAssignment.updateMany({
      where: {
        id: assignmentId,
        assignedToId: null,
        status: DeliveryAssignmentStatus.UNASSIGNED,
      },
      data: {
        assignedToId: userId,
        assignedAt: new Date(),
        status: DeliveryAssignmentStatus.ASSIGNED,
      },
    });

    if (claimed.count === 0) {
      throw ApiError.badRequest('Somebody else has already taken this consignment.');
    }

    return mapAssignmentDetail(await deliveryAssignmentService.get(assignmentId));
  }

  /** Putting it back, because the round changed. Not a failure — no attempt is recorded. */
  async release(userId: string, assignmentId: string) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('This consignment is not yours to hand back.');
    }

    const updated = await deliveryAssignmentService.transition(
      assignmentId,
      DeliveryAssignmentStatus.UNASSIGNED,
      { assignedTo: { disconnect: true }, assignedAt: null },
    );
    return mapAssignmentDetail(updated);
  }

  /**
   * Collected from the counter.
   *
   * The docket number is demanded here, not at delivery, and only for services that say they need
   * one — a courier hands it over at pickup, and asking for it hours later means asking somebody
   * to remember it.
   */
  async pickup(userId: string, assignmentId: string, input: { trackingNumber?: string; notes?: string }) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('Take this consignment first.');
    }

    if (assignment.deliveryService.requiresTrackingNumber && !input.trackingNumber?.trim()) {
      throw ApiError.badRequest(
        `${assignment.deliveryService.name} needs a tracking or docket number at pickup.`,
      );
    }

    const updated = await deliveryAssignmentService.transition(
      assignmentId,
      DeliveryAssignmentStatus.PICKED_UP,
      {
        pickedUpAt: new Date(),
        ...(input.trackingNumber ? { trackingNumber: input.trackingNumber.trim() } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    );
    await deliveryAssignmentService.syncOrderDeliveryStatus(assignmentId);
    return mapAssignmentDetail(updated);
  }

  /** On the road. Optional — some rounds go straight from pickup to the door. */
  async markInTransit(userId: string, assignmentId: string) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('This consignment is not yours.');
    }
    const updated = await deliveryAssignmentService.transition(
      assignmentId,
      DeliveryAssignmentStatus.IN_TRANSIT,
    );
    await deliveryAssignmentService.syncOrderDeliveryStatus(assignmentId);
    return mapAssignmentDetail(updated);
  }

  /** Handed over. Receiver's name is required; the photo is not, because signal is not. */
  async deliver(
    userId: string,
    assignmentId: string,
    input: { receiverName: string; receiverPhone?: string; proofPhotoKey?: string; notes?: string },
  ) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('This consignment is not yours.');
    }

    const updated = await deliveryAssignmentService.recordAttempt({
      assignmentId,
      outcome: DeliveryAttemptOutcome.DELIVERED,
      byUserId: userId,
      receiverName: input.receiverName,
      receiverPhone: input.receiverPhone,
      proofPhotoKey: input.proofPhotoKey,
      notes: input.notes,
    });
    await deliveryAssignmentService.syncOrderDeliveryStatus(assignmentId);
    return mapAssignmentDetail(updated);
  }

  /**
   * Nobody there, shop shut, address wrong.
   *
   * The consignment stays with the agent rather than bouncing back to the pool, because the goods
   * are physically in their van. The reason is kept as its own attempt row so a second try cannot
   * erase why the first one failed — that reason is exactly what the vendor rings up to ask about.
   */
  async fail(userId: string, assignmentId: string, input: { reason: string; proofPhotoKey?: string }) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('This consignment is not yours.');
    }

    const updated = await deliveryAssignmentService.recordAttempt({
      assignmentId,
      outcome: DeliveryAttemptOutcome.FAILED,
      byUserId: userId,
      reason: input.reason,
      proofPhotoKey: input.proofPhotoKey,
    });
    await deliveryAssignmentService.syncOrderDeliveryStatus(assignmentId);
    return mapAssignmentDetail(updated);
  }

  /** Back on the road after a failed attempt. */
  async retry(userId: string, assignmentId: string) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('This consignment is not yours.');
    }
    const updated = await deliveryAssignmentService.transition(
      assignmentId,
      DeliveryAssignmentStatus.IN_TRANSIT,
    );
    return mapAssignmentDetail(updated);
  }

  /** Undeliverable — coming back to the shop. Ends the consignment. */
  async markReturned(userId: string, assignmentId: string, reason: string) {
    const assignment = await this.loadForAction(userId, assignmentId);
    if (assignment.assignedToId !== userId) {
      throw ApiError.forbidden('This consignment is not yours.');
    }
    const updated = await deliveryAssignmentService.transition(
      assignmentId,
      DeliveryAssignmentStatus.RETURNED,
      { notes: reason, lastFailureReason: reason },
    );
    await deliveryAssignmentService.syncOrderDeliveryStatus(assignmentId);
    return mapAssignmentDetail(updated);
  }

  /**
   * Authorises a proof photo straight to storage.
   *
   * The bytes never pass through the API, which is what makes a photo practical to upload from a
   * doorstep on a phone connection.
   */
  async createUploadTicket(input: { fileName: string; contentType: string; fileSize: number }) {
    if (!input.contentType.toLowerCase().startsWith('image/')) {
      throw ApiError.badRequest('Proof of delivery must be a photo');
    }
    if (input.fileSize > MAX_PROOF_PHOTO_BYTES) {
      throw ApiError.badRequest('That photo is too large. Please take a smaller one.');
    }

    const presigned = await storageService.createPresignedMediaUpload({
      folder: STORAGE_FOLDERS.DOCUMENTS,
      fileName: input.fileName,
      contentType: input.contentType,
    });

    return {
      uploadUrl: presigned.uploadUrl,
      fileKey: presigned.key,
      expiresInSeconds: presigned.expiresIn,
      maxSizeBytes: MAX_PROOF_PHOTO_BYTES,
    };
  }

  /** A short-lived link to a proof photo, for the admin board and the agent's own history. */
  async proofPhotoUrl(key: string): Promise<string | null> {
    try {
      const result = await storageService.createPresignedDownload(key, { mimeType: 'image/jpeg' });
      return result.url;
    } catch {
      return null;
    }
  }

  /** Loads a consignment and checks the caller may act on it at all. */
  private async loadForAction(userId: string, assignmentId: string) {
    const assignment = await deliveryAssignmentService.get(assignmentId);
    const serviceIds = await this.serviceIdsFor(userId);
    assertAgentCanAct({
      taggedServiceIds: serviceIds,
      deliveryServiceId: assignment.deliveryServiceId,
      assignedToId: assignment.assignedToId,
      agentUserId: userId,
    });
    return assignment;
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

const QUEUE_INCLUDE = {
  deliveryService: { select: { id: true, code: true, name: true, colorHex: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, phone: true } },
  dispatchBatch: {
    select: {
      id: true,
      dispatchDate: true,
      dispatchedAt: true,
      shift: { select: { label: true } },
      vendor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          vendorProfile: { select: { businessName: true, vendorCode: true, city: true } },
        },
      },
      retailCustomer: { select: { name: true, phone: true } },
      invoice: { select: { invoiceNumber: true, total: true } },
      _count: { select: { orders: true } },
    },
  },
} satisfies Prisma.DeliveryAssignmentInclude;

export const deliveryPortalService = new DeliveryPortalService();
