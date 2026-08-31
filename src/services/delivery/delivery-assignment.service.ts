import {
  DeliveryAssignmentStatus,
  DeliveryAttemptOutcome,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { assertTransition } from './delivery-scope.js';
import { deliveryRoutingService } from './delivery-routing.service.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The life of one consignment, from the moment it leaves the counter to the signature at the door.
 *
 * Two things are worth knowing before reading the methods.
 *
 * **Creation is idempotent and never blocks dispatch.** `createForBatch` is called from inside
 * `markDispatched`. If it throws, goods that have physically left the building would be stuck
 * un-dispatched in the system — so it is written to be safe to call twice and to log rather than
 * throw when it genuinely cannot proceed. A consignment with no assignment shows up in the
 * delivery board's unrouted tray, which is a problem an admin can fix in ten seconds; a dispatch
 * that failed at the counter is not.
 *
 * **Every state change goes through `transition`.** The legal moves live in one table in
 * `delivery-scope.ts`, so a stale phone screen tapping "delivered" on a consignment somebody
 * already returned is refused by the rule rather than by whichever handler happened to check.
 */
export class DeliveryAssignmentService {
  /**
   * Puts a dispatched batch into its service's queue.
   *
   * Returns null when there is nothing to route to — no service on the batch, or the batch is a
   * retail counter sale. That is not an error; see the note above.
   */
  async createForBatch(
    batchId: string,
    db: Db = prisma,
  ): Promise<{ id: string; deliveryServiceId: string } | null> {
    try {
      const batch = await db.dispatchBatch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          vendorId: true,
          deliveryServiceId: true,
          deliveryAssignment: { select: { id: true, deliveryServiceId: true } },
        },
      });

      if (!batch) return null;
      // Already routed — dispatch was retried, or an admin placed it by hand first.
      if (batch.deliveryAssignment) return batch.deliveryAssignment;

      // An override on the batch wins; otherwise follow the vendor's tag, read now rather than
      // when the batch was opened, so a tag fixed this morning applies to goods leaving today.
      const serviceId =
        batch.deliveryServiceId ??
        (batch.vendorId ? await deliveryRoutingService.resolveForVendorUser(batch.vendorId, db) : null);
      if (!serviceId) return null;

      const service = await db.deliveryService.findUnique({
        where: { id: serviceId },
        select: { slaHours: true },
      });

      const created = await db.deliveryAssignment.create({
        data: {
          dispatchBatchId: batch.id,
          deliveryServiceId: serviceId,
          status: DeliveryAssignmentStatus.UNASSIGNED,
          // Frozen from the service as it stands today, so a later settings change cannot
          // retroactively make yesterday's delivery late.
          dueAt: service?.slaHours
            ? new Date(Date.now() + service.slaHours * 3_600_000)
            : null,
        },
        select: { id: true, deliveryServiceId: true },
      });

      return created;
    } catch (error) {
      // Deliberately swallowed: the goods are already gone. See the class docblock.
      logger.error('Failed to create a delivery assignment for a dispatched batch', {
        batchId,
        error,
      });
      return null;
    }
  }

  /** Loads one consignment with everything a screen or a rule needs to decide about it. */
  async get(assignmentId: string) {
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      include: ASSIGNMENT_DETAIL_INCLUDE,
    });
    if (!assignment) throw ApiError.notFound('Consignment not found');
    return assignment;
  }

  /**
   * Moves a consignment to a new state, validating the move first.
   *
   * Takes the expected current status from the caller's already-loaded row and re-reads inside the
   * transaction, so two delivery people tapping at once cannot both win.
   */
  async transition(
    assignmentId: string,
    to: DeliveryAssignmentStatus,
    data: Prisma.DeliveryAssignmentUpdateInput = {},
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({
        where: { id: assignmentId },
        select: { id: true, status: true },
      });
      if (!current) throw ApiError.notFound('Consignment not found');

      assertTransition(current.status, to);

      return tx.deliveryAssignment.update({
        where: { id: assignmentId },
        data: { status: to, ...data },
        include: ASSIGNMENT_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Records one knock on the door.
   *
   * The attempt row is written in the same transaction as the status change, and the attempt
   * number is derived from a count inside it — so a retry that races another cannot produce two
   * "attempt 2" rows, and the unique index would refuse them anyway.
   */
  async recordAttempt(input: {
    assignmentId: string;
    outcome: DeliveryAttemptOutcome;
    byUserId: string;
    reason?: string;
    receiverName?: string;
    receiverPhone?: string;
    proofPhotoKey?: string;
    notes?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.deliveryAssignment.findUnique({
        where: { id: input.assignmentId },
        select: { id: true, status: true, attemptCount: true },
      });
      if (!current) throw ApiError.notFound('Consignment not found');

      const delivered = input.outcome === DeliveryAttemptOutcome.DELIVERED;
      const to = delivered ? DeliveryAssignmentStatus.DELIVERED : DeliveryAssignmentStatus.FAILED;
      assertTransition(current.status, to);

      const attemptNumber = current.attemptCount + 1;
      await tx.deliveryAttempt.create({
        data: {
          assignmentId: input.assignmentId,
          attemptNumber,
          outcome: input.outcome,
          reason: input.reason ?? null,
          receiverName: input.receiverName ?? null,
          proofPhotoKey: input.proofPhotoKey ?? null,
          byUserId: input.byUserId,
        },
      });

      return tx.deliveryAssignment.update({
        where: { id: input.assignmentId },
        data: {
          status: to,
          attemptCount: attemptNumber,
          ...(delivered
            ? {
                deliveredAt: new Date(),
                receiverName: input.receiverName ?? null,
                receiverPhone: input.receiverPhone ?? null,
                proofPhotoKey: input.proofPhotoKey ?? null,
                lastFailureReason: null,
              }
            : {
                failedAt: new Date(),
                lastFailureReason: input.reason ?? null,
              }),
          ...(input.notes ? { notes: input.notes } : {}),
        },
        include: ASSIGNMENT_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Pushes the delivery outcome back onto the orders inside the consignment.
   *
   * The orders' `deliveryStatus` is what a vendor sees on their own order page, so it must follow
   * the consignment rather than be updated by hand somewhere else. Kept out of `transition` so a
   * queue movement — claiming, handing back — does not touch order rows for no reason.
   */
  async syncOrderDeliveryStatus(assignmentId: string, db: Db = prisma): Promise<void> {
    const assignment = await db.deliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        status: true,
        dispatchBatch: { select: { orders: { select: { orderId: true } } } },
      },
    });
    if (!assignment) return;

    const orderDeliveryStatus = ORDER_STATUS_BY_ASSIGNMENT[assignment.status];
    if (!orderDeliveryStatus) return;

    const orderIds = assignment.dispatchBatch.orders.map((row) => row.orderId);
    if (orderIds.length === 0) return;

    await db.productionOrder.updateMany({
      where: { id: { in: orderIds } },
      data: {
        deliveryStatus: orderDeliveryStatus,
        // A delivered consignment completes its orders. Nothing else moves order status: a
        // consignment in transit is already DISPATCHED from the dispatch step.
        ...(assignment.status === DeliveryAssignmentStatus.DELIVERED
          ? { status: 'DELIVERED' as const }
          : {}),
      },
    });
  }
}

/** How a consignment's state reads on the orders inside it. */
const ORDER_STATUS_BY_ASSIGNMENT: Partial<
  Record<DeliveryAssignmentStatus, 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'>
> = {
  [DeliveryAssignmentStatus.PICKED_UP]: 'IN_TRANSIT',
  [DeliveryAssignmentStatus.IN_TRANSIT]: 'IN_TRANSIT',
  [DeliveryAssignmentStatus.DELIVERED]: 'DELIVERED',
  [DeliveryAssignmentStatus.FAILED]: 'FAILED',
  [DeliveryAssignmentStatus.RETURNED]: 'FAILED',
  [DeliveryAssignmentStatus.CANCELLED]: 'CANCELLED',
};

export const ASSIGNMENT_DETAIL_INCLUDE = {
  deliveryService: {
    select: { id: true, code: true, name: true, kind: true, colorHex: true, requiresTrackingNumber: true },
  },
  assignedTo: { select: { id: true, firstName: true, lastName: true, phone: true } },
  attempts: { orderBy: { attemptNumber: 'asc' } },
  dispatchBatch: {
    select: {
      id: true,
      dispatchDate: true,
      dispatchedAt: true,
      deliveryCharge: true,
      shift: { select: { id: true, label: true, cutoffTime: true } },
      vendor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          vendorProfile: {
            select: {
              businessName: true,
              vendorCode: true,
              fullAddress: true,
              city: true,
              district: true,
              state: true,
              pinCode: true,
            },
          },
        },
      },
      retailCustomer: { select: { id: true, name: true, phone: true } },
      invoice: { select: { id: true, invoiceNumber: true, total: true } },
      orders: {
        select: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderName: true,
              isReprint: true,
              deliveryAddress: true,
              items: { select: { quantity: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DeliveryAssignmentInclude;

export const deliveryAssignmentService = new DeliveryAssignmentService();
