import { DeliveryAssignmentStatus, RoleName, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  ASSIGNMENT_DETAIL_INCLUDE,
  deliveryAssignmentService,
  deliveryRoutingService,
  CLOSED_ASSIGNMENT_STATUSES,
} from '../../services/delivery/index.js';
import { notifyUser } from '../orders/order-events.service.js';
import type {
  AssignInput,
  CancelAssignmentInput,
  CreateServiceInput,
  DeliveryStatsQuery,
  ListAgentsQuery,
  ListAssignmentsQuery,
  ListServicesQuery,
  RerouteInput,
  SetAgentServicesInput,
  SetVendorServicesInput,
  UpdateServiceInput,
} from './admin-delivery.validation.js';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * The delivery department, from the admin's side.
 *
 * Three jobs: keep the service master, decide who handles which service, and watch the board of
 * consignments on the road. The routing itself is not here — it is a property of the vendor's tag
 * and happens on its own at dispatch. What is here is everything a human needs to do when the
 * automatic answer is not the right one.
 */
export class AdminDeliveryService {
  // ── The service master ────────────────────────────────────────────────────

  async listServices(query: ListServicesQuery) {
    const services = await prisma.deliveryService.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { vendors: true, agents: true } },
      },
    });

    // Open consignment counts, in one grouped query rather than one per service.
    const openCounts = await prisma.deliveryAssignment.groupBy({
      by: ['deliveryServiceId'],
      where: { status: { notIn: CLOSED_ASSIGNMENT_STATUSES } },
      _count: { _all: true },
    });
    const openByService = new Map(openCounts.map((row) => [row.deliveryServiceId, row._count._all]));

    return services.map((service) => ({
      id: service.id,
      code: service.code,
      name: service.name,
      kind: service.kind,
      description: service.description,
      colorHex: service.colorHex,
      requiresTrackingNumber: service.requiresTrackingNumber,
      slaHours: service.slaHours,
      sortOrder: service.sortOrder,
      isActive: service.isActive,
      vendorCount: service._count.vendors,
      agentCount: service._count.agents,
      openConsignments: openByService.get(service.id) ?? 0,
      createdAt: service.createdAt.toISOString(),
    }));
  }

  async createService(input: CreateServiceInput, adminUserId: string) {
    const existing = await prisma.deliveryService.findUnique({ where: { code: input.code } });
    if (existing) throw ApiError.badRequest(`A delivery service with code ${String(input.code)} already exists`);

    return prisma.deliveryService.create({
      data: {
        code: input.code,
        name: input.name,
        kind: input.kind,
        description: input.description ?? null,
        colorHex: input.colorHex,
        requiresTrackingNumber: input.requiresTrackingNumber,
        slaHours: input.slaHours ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        createdById: adminUserId,
      },
    });
  }

  /**
   * Edits a service. Deactivating is allowed with consignments in flight — those keep the service
   * they left with — but the service stops being offered on new vendor tags, and a vendor whose
   * only service was deactivated routes nowhere, which the board shows as unrouted.
   */
  async updateService(id: string, input: UpdateServiceInput) {
    const service = await prisma.deliveryService.findUnique({ where: { id } });
    if (!service) throw ApiError.notFound('Delivery service not found');

    return prisma.deliveryService.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.kind !== undefined && { kind: input.kind }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.colorHex !== undefined && { colorHex: input.colorHex }),
        ...(input.requiresTrackingNumber !== undefined && {
          requiresTrackingNumber: input.requiresTrackingNumber,
        }),
        ...(input.slaHours !== undefined && { slaHours: input.slaHours ?? null }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  // ── Delivery people ───────────────────────────────────────────────────────

  /**
   * The delivery roster: everyone who can carry a consignment, with the services they hold and
   * how much is on their plate right now.
   */
  async listAgents(query: ListAgentsQuery) {
    const agents = await prisma.user.findMany({
      where: {
        role: { name: RoleName.DELIVERY },
        deletedAt: null,
        ...(query.includeInactive ? {} : { status: 'ACTIVE' }),
        ...(query.deliveryServiceId && {
          deliveryAgentServices: { some: { deliveryServiceId: query.deliveryServiceId } },
        }),
        ...(query.search && {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: { firstName: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        deliveryAgentServices: {
          select: {
            deliveryService: { select: { id: true, code: true, name: true, colorHex: true } },
          },
        },
        _count: {
          select: {
            deliveryAssignments: {
              where: { status: { notIn: CLOSED_ASSIGNMENT_STATUSES } },
            },
          },
        },
      },
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: `${agent.firstName} ${agent.lastName}`.trim(),
      email: agent.email,
      phone: agent.phone,
      status: agent.status,
      services: agent.deliveryAgentServices.map((row) => row.deliveryService),
      openConsignments: agent._count.deliveryAssignments,
      createdAt: agent.createdAt.toISOString(),
    }));
  }

  /**
   * Sets which services one delivery person handles.
   *
   * Whole-set replacement inside a transaction: an admin edits a list and saves it, and a
   * half-applied change would leave someone seeing consignments they were just untagged from.
   */
  async setAgentServices(userId: string, input: SetAgentServicesInput, adminUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: { select: { name: true } } },
    });
    if (!user) throw ApiError.notFound('User not found');
    if (user.role.name !== RoleName.DELIVERY) {
      throw ApiError.badRequest('Only a delivery department member can be tagged with services');
    }

    const unique = [...new Set(input.deliveryServiceIds)];

    await prisma.$transaction(async (tx) => {
      await tx.deliveryAgentService.deleteMany({
        where: { userId, deliveryServiceId: { notIn: unique.length > 0 ? unique : [''] } },
      });
      for (const deliveryServiceId of unique) {
        await tx.deliveryAgentService.upsert({
          where: { userId_deliveryServiceId: { userId, deliveryServiceId } },
          create: { userId, deliveryServiceId, assignedById: adminUserId },
          update: {},
        });
      }
    });

    return this.listAgents({ includeInactive: true }).then((agents) =>
      agents.find((agent) => agent.id === userId),
    );
  }

  // ── Vendor tagging ────────────────────────────────────────────────────────

  async getVendorServices(vendorProfileId: string) {
    const rows = await deliveryRoutingService.listForVendorProfile(vendorProfileId);
    return {
      services: rows.map((row) => ({ ...row.deliveryService, isDefault: row.isDefault })),
      defaultDeliveryServiceId: rows.find((row) => row.isDefault)?.deliveryServiceId ?? null,
    };
  }

  async setVendorServices(vendorProfileId: string, input: SetVendorServicesInput) {
    const profile = await prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      select: { id: true },
    });
    if (!profile) throw ApiError.notFound('Vendor not found');

    await prisma.$transaction((tx) =>
      deliveryRoutingService.setForVendorProfile(
        vendorProfileId,
        input.deliveryServiceIds,
        input.defaultDeliveryServiceId ?? null,
        tx,
      ),
    );

    return this.getVendorServices(vendorProfileId);
  }

  // ── The board ─────────────────────────────────────────────────────────────

  async listAssignments(query: ListAssignmentsQuery) {
    const where: Prisma.DeliveryAssignmentWhereInput = {
      ...(query.deliveryServiceId && { deliveryServiceId: query.deliveryServiceId }),
      ...(query.status && { status: query.status }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.unassignedOnly && {
        assignedToId: null,
        status: DeliveryAssignmentStatus.UNASSIGNED,
      }),
      ...(query.overdueOnly && {
        dueAt: { lt: new Date() },
        status: { notIn: CLOSED_ASSIGNMENT_STATUSES },
      }),
      ...(query.vendorUserId && { dispatchBatch: { vendorId: query.vendorUserId } }),
      ...((query.from ?? query.to) && {
        createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
      }),
      ...(query.search && {
        OR: [
          { trackingNumber: { contains: query.search, mode: 'insensitive' as const } },
          { receiverName: { contains: query.search, mode: 'insensitive' as const } },
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

    const orderBy: Prisma.DeliveryAssignmentOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : query.sort === 'due'
          ? [{ dueAt: 'asc' }]
          : [{ createdAt: 'desc' }];

    const [rows, total, byStatus] = await Promise.all([
      prisma.deliveryAssignment.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: LIST_INCLUDE,
      }),
      prisma.deliveryAssignment.count({ where }),
      prisma.deliveryAssignment.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    return {
      data: rows.map(mapAssignmentRow),
      counts: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  async getAssignment(id: string) {
    return mapAssignmentDetail(await deliveryAssignmentService.get(id));
  }

  /**
   * Hands a consignment to a particular delivery person, or back to the shared queue.
   *
   * The target must already be tagged with this consignment's service — otherwise an admin could
   * hand a bus consignment to a local rider who has no way to complete it, and the delivery
   * portal would then refuse to show them their own work.
   */
  async assign(id: string, input: AssignInput, adminUserId: string) {
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id },
      select: { id: true, status: true, deliveryServiceId: true },
    });
    if (!assignment) throw ApiError.notFound('Consignment not found');

    if (input.assignedToId) {
      const tagged = await prisma.deliveryAgentService.findUnique({
        where: {
          userId_deliveryServiceId: {
            userId: input.assignedToId,
            deliveryServiceId: assignment.deliveryServiceId,
          },
        },
        select: { id: true },
      });
      if (!tagged) {
        throw ApiError.badRequest(
          'That delivery person does not handle this service. Tag them with it first, or pick someone who does.',
        );
      }
    }

    const updated = await deliveryAssignmentService.transition(
      id,
      input.assignedToId ? DeliveryAssignmentStatus.ASSIGNED : DeliveryAssignmentStatus.UNASSIGNED,
      {
        assignedTo: input.assignedToId ? { connect: { id: input.assignedToId } } : { disconnect: true },
        assignedBy: { connect: { id: adminUserId } },
        assignedAt: input.assignedToId ? new Date() : null,
      },
    );

    if (input.assignedToId) {
      await notifyUser(input.assignedToId, {
        type: 'DELIVERY_ASSIGNED',
        title: 'A consignment was assigned to you',
        body: 'Open your delivery queue to see the pickup details.',
      }).catch(() => undefined);
    }

    return mapAssignmentDetail(updated);
  }

  /**
   * Moves a consignment to a different service.
   *
   * Clears the person holding it: the point of a reroute is that the current service was wrong,
   * and whoever had it is by definition not on the new one.
   */
  async reroute(id: string, input: RerouteInput, adminUserId: string) {
    const service = await prisma.deliveryService.findUnique({
      where: { id: input.deliveryServiceId },
      select: { id: true, isActive: true, slaHours: true },
    });
    if (!service?.isActive) throw ApiError.badRequest('That delivery service is not available');

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!assignment) throw ApiError.notFound('Consignment not found');
    if (CLOSED_ASSIGNMENT_STATUSES.includes(assignment.status)) {
      throw ApiError.badRequest('This consignment is already closed and cannot be rerouted');
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id },
      data: {
        deliveryServiceId: input.deliveryServiceId,
        assignedToId: null,
        assignedById: adminUserId,
        assignedAt: null,
        status: DeliveryAssignmentStatus.UNASSIGNED,
        dueAt: service.slaHours ? new Date(Date.now() + service.slaHours * 3_600_000) : null,
        ...(input.reason ? { notes: input.reason } : {}),
      },
      include: ASSIGNMENT_DETAIL_INCLUDE,
    });

    // The batch override is written too, so the reason this consignment went by a different
    // service is visible on the dispatch record and not only on the delivery one.
    await prisma.dispatchBatch.update({
      where: { id: updated.dispatchBatchId },
      data: { deliveryServiceId: input.deliveryServiceId },
    });

    return mapAssignmentDetail(updated);
  }

  async cancel(id: string, input: CancelAssignmentInput) {
    const updated = await deliveryAssignmentService.transition(
      id,
      DeliveryAssignmentStatus.CANCELLED,
      { cancelledAt: new Date(), notes: input.reason },
    );
    await deliveryAssignmentService.syncOrderDeliveryStatus(id);
    return mapAssignmentDetail(updated);
  }

  /**
   * Places a consignment that dispatch could not route — the vendor had no tag at the time.
   *
   * Its own method rather than a reuse of `reroute` because the starting state is different:
   * there is no assignment row at all, only a dispatched batch nobody is carrying.
   */
  async routeUnroutedBatch(batchId: string, deliveryServiceId: string, adminUserId: string) {
    const batch = await prisma.dispatchBatch.findUnique({
      where: { id: batchId },
      select: { id: true, status: true, deliveryAssignment: { select: { id: true } } },
    });
    if (!batch) throw ApiError.notFound('Dispatch batch not found');
    if (batch.deliveryAssignment) {
      throw ApiError.badRequest('This consignment is already on the delivery board');
    }

    await prisma.dispatchBatch.update({
      where: { id: batchId },
      data: { deliveryServiceId },
    });

    const created = await deliveryAssignmentService.createForBatch(batchId);
    if (!created) throw ApiError.badRequest('Could not place this consignment');

    return this.assign(created.id, { assignedToId: null }, adminUserId);
  }

  /** Dispatched batches with nobody carrying them — the tray an admin clears every morning. */
  async listUnrouted() {
    const batches = await prisma.dispatchBatch.findMany({
      where: { status: 'DISPATCHED', deliveryAssignment: null },
      orderBy: { dispatchedAt: 'desc' },
      take: 100,
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
            vendorProfile: { select: { businessName: true, vendorCode: true, city: true } },
          },
        },
        retailCustomer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
        _count: { select: { orders: true } },
      },
    });

    return batches.map((batch) => ({
      batchId: batch.id,
      dispatchDate: batch.dispatchDate,
      dispatchedAt: batch.dispatchedAt?.toISOString() ?? null,
      shiftLabel: batch.shift.label,
      vendorUserId: batch.vendor?.id ?? null,
      partyName:
        batch.vendor?.vendorProfile?.businessName ??
        (batch.vendor ? `${batch.vendor.firstName} ${batch.vendor.lastName}` : null) ??
        batch.retailCustomer?.name ??
        'Counter sale',
      vendorCode: batch.vendor?.vendorProfile?.vendorCode ?? null,
      city: batch.vendor?.vendorProfile?.city ?? null,
      invoiceNumber: batch.invoice?.invoiceNumber ?? null,
      orderCount: batch._count.orders,
    }));
  }

  // ── Numbers ───────────────────────────────────────────────────────────────

  async stats(query: DeliveryStatsQuery) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getFullYear(), to.getMonth(), 1);
    const range = { gte: from, lte: to };

    const [byStatus, byService, delivered, openCount, overdueCount, unroutedCount, agentLoad] =
      await Promise.all([
        prisma.deliveryAssignment.groupBy({
          by: ['status'],
          where: { createdAt: range },
          _count: { _all: true },
        }),
        prisma.deliveryAssignment.groupBy({
          by: ['deliveryServiceId'],
          where: { createdAt: range },
          _count: { _all: true },
        }),
        prisma.deliveryAssignment.findMany({
          where: { createdAt: range, deliveredAt: { not: null } },
          select: { createdAt: true, deliveredAt: true, dueAt: true, attemptCount: true },
        }),
        prisma.deliveryAssignment.count({
          where: { status: { notIn: CLOSED_ASSIGNMENT_STATUSES } },
        }),
        prisma.deliveryAssignment.count({
          where: { dueAt: { lt: new Date() }, status: { notIn: CLOSED_ASSIGNMENT_STATUSES } },
        }),
        prisma.dispatchBatch.count({ where: { status: 'DISPATCHED', deliveryAssignment: null } }),
        prisma.deliveryAssignment.groupBy({
          by: ['assignedToId'],
          where: { status: { notIn: CLOSED_ASSIGNMENT_STATUSES }, assignedToId: { not: null } },
          _count: { _all: true },
        }),
      ]);

    const hours = delivered
      .map((row) =>
        row.deliveredAt ? (row.deliveredAt.getTime() - row.createdAt.getTime()) / 3_600_000 : null,
      )
      .filter((value): value is number => value !== null);

    const onTime = delivered.filter(
      (row) => row.dueAt === null || (row.deliveredAt !== null && row.deliveredAt <= row.dueAt),
    ).length;

    const services = await prisma.deliveryService.findMany({
      where: { id: { in: byService.map((row) => row.deliveryServiceId) } },
      select: { id: true, name: true, colorHex: true },
    });
    const serviceById = new Map(services.map((service) => [service.id, service]));

    const agentIds = agentLoad
      .map((row) => row.assignedToId)
      .filter((id): id is string => id !== null);
    const agents = agentIds.length
      ? await prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        raised: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        open: openCount,
        overdue: overdueCount,
        unrouted: unroutedCount,
        delivered: delivered.length,
        averageDeliveryHours:
          hours.length === 0 ? 0 : round2(hours.reduce((sum, value) => sum + value, 0) / hours.length),
        onTimePercent: delivered.length === 0 ? 0 : round2((onTime / delivered.length) * 100),
        failedAttempts: delivered.reduce(
          (sum, row) => sum + Math.max(0, row.attemptCount - 1),
          0,
        ),
      },
      byStatus: byStatus.map((row) => ({ key: row.status, count: row._count._all })),
      byService: byService
        .map((row) => ({
          deliveryServiceId: row.deliveryServiceId,
          name: serviceById.get(row.deliveryServiceId)?.name ?? 'Unknown',
          colorHex: serviceById.get(row.deliveryServiceId)?.colorHex ?? '#94a3b8',
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      agentLoad: agentLoad
        .map((row) => ({
          userId: row.assignedToId,
          name: row.assignedToId
            ? `${agentById.get(row.assignedToId)?.firstName ?? ''} ${agentById.get(row.assignedToId)?.lastName ?? ''}`.trim() ||
              'Unknown'
            : 'Unknown',
          openConsignments: row._count._all,
        }))
        .sort((a, b) => b.openConsignments - a.openConsignments),
    };
  }
}

const LIST_INCLUDE = {
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

type ListRow = Prisma.DeliveryAssignmentGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.DeliveryAssignmentGetPayload<{ include: typeof ASSIGNMENT_DETAIL_INCLUDE }>;

/** Party name, with the same fallback chain everywhere so one consignment never has two names. */
function partyNameOf(batch: {
  vendor: { firstName: string; lastName: string; vendorProfile: { businessName: string } | null } | null;
  retailCustomer: { name: string } | null;
}): string {
  return (
    batch.vendor?.vendorProfile?.businessName ??
    (batch.vendor ? `${batch.vendor.firstName} ${batch.vendor.lastName}`.trim() : null) ??
    batch.retailCustomer?.name ??
    'Counter sale'
  );
}

export function mapAssignmentRow(row: ListRow) {
  return {
    id: row.id,
    status: row.status,
    deliveryService: row.deliveryService,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo
      ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`.trim()
      : null,
    trackingNumber: row.trackingNumber,
    attemptCount: row.attemptCount,
    dueAt: row.dueAt?.toISOString() ?? null,
    isOverdue:
      row.dueAt !== null &&
      row.dueAt < new Date() &&
      !CLOSED_ASSIGNMENT_STATUSES.includes(row.status),
    dispatchedAt: row.dispatchBatch.dispatchedAt?.toISOString() ?? null,
    dispatchDate: row.dispatchBatch.dispatchDate,
    shiftLabel: row.dispatchBatch.shift.label,
    partyName: partyNameOf(row.dispatchBatch),
    vendorUserId: row.dispatchBatch.vendor?.id ?? null,
    vendorCode: row.dispatchBatch.vendor?.vendorProfile?.vendorCode ?? null,
    city: row.dispatchBatch.vendor?.vendorProfile?.city ?? null,
    phone: row.dispatchBatch.vendor?.phone ?? row.dispatchBatch.retailCustomer?.phone ?? null,
    invoiceNumber: row.dispatchBatch.invoice?.invoiceNumber ?? null,
    orderCount: row.dispatchBatch._count.orders,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapAssignmentDetail(row: DetailRow) {
  const batch = row.dispatchBatch;
  const profile = batch.vendor?.vendorProfile ?? null;

  return {
    id: row.id,
    status: row.status,
    deliveryService: row.deliveryService,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo
      ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`.trim()
      : null,
    assignedToPhone: row.assignedTo?.phone ?? null,
    trackingNumber: row.trackingNumber,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    proofPhotoKey: row.proofPhotoKey,
    notes: row.notes,
    attemptCount: row.attemptCount,
    lastFailureReason: row.lastFailureReason,
    dueAt: row.dueAt?.toISOString() ?? null,
    isOverdue:
      row.dueAt !== null &&
      row.dueAt < new Date() &&
      !CLOSED_ASSIGNMENT_STATUSES.includes(row.status),
    assignedAt: row.assignedAt?.toISOString() ?? null,
    pickedUpAt: row.pickedUpAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    consignment: {
      batchId: batch.id,
      dispatchDate: batch.dispatchDate,
      dispatchedAt: batch.dispatchedAt?.toISOString() ?? null,
      shiftLabel: batch.shift.label,
      deliveryCharge: batch.deliveryCharge === null ? null : Number(batch.deliveryCharge),
      invoice: batch.invoice
        ? { id: batch.invoice.id, invoiceNumber: batch.invoice.invoiceNumber, total: Number(batch.invoice.total) }
        : null,
      partyName: partyNameOf(batch),
      vendorUserId: batch.vendor?.id ?? null,
      vendorCode: profile?.vendorCode ?? null,
      phone: batch.vendor?.phone ?? batch.retailCustomer?.phone ?? null,
      address: profile
        ? [profile.fullAddress, profile.city, profile.district, profile.state, profile.pinCode]
            .filter(Boolean)
            .join(', ')
        : null,
      orders: batch.orders.map(({ order }) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderName: order.orderName,
        isReprint: order.isReprint,
        deliveryAddress: order.deliveryAddress,
        quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      })),
    },
    attempts: row.attempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome,
      reason: attempt.reason,
      receiverName: attempt.receiverName,
      proofPhotoKey: attempt.proofPhotoKey,
      createdAt: attempt.createdAt.toISOString(),
    })),
  };
}

export const adminDeliveryService = new AdminDeliveryService();
