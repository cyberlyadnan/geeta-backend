import {
  OrderCancellationRequestStatus,
  OrderCancellationRequestType,
  ProductionOrderStatus,
  RoleName,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { activityLogService } from '../../services/activity/activity-log.service.js';
import { eventBus, APP_EVENTS } from '../../events/eventBus.js';
import { emitOrderStatusChanged } from '../../websocket/emitters/order.emitter.js';
import { notifyUser, recordOrderEvent } from '../orders/order-events.service.js';
import {
  assertCanManageProductionOrders,
  canManageProductionOrders,
} from '../production/orders/production-order.access.js';
import { workflowEngine } from '../workflow/workflow.engine.js';
import { buildCancellationContextSnapshot } from './cancellation-context.builder.js';
import {
  resolveCancellationPolicy,
  resolveStageFromOrderStatus,
} from './cancellation-policy.engine.js';
import {
  CANCELLATION_ALLOWED_ACTION,
  CANCELLATION_EVENT_TYPES,
  CANCELLATION_NOTIFICATION_TYPES,
} from './cancellation.constants.js';
import type {
  ApproveCancellationInput,
  ListCancellationRequestsQuery,
  RejectCancellationInput,
  VendorCancelInput,
  VendorRequestCancellationInput,
} from './order-cancellation.validation.js';

const MANAGER_ROLES: ReadonlySet<RoleName> = new Set([
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
]);

/** Slow DB + multi-step cancel must not hit Prisma's default 5s interactive timeout. */
const CANCEL_TX_OPTIONS = { maxWait: 10_000, timeout: 45_000 } as const;

function mapRequestToDto(
  request: Prisma.OrderCancellationRequestGetPayload<{
    include: {
      reason: true;
      requestedBy: { select: { id: true; firstName: true; lastName: true; email: true } };
      decidedBy: { select: { id: true; firstName: true; lastName: true; email: true } };
      order: { select: { id: true; orderNumber: true; orderName: true; status: true; customerId: true } };
    };
  }>,
) {
  return {
    id: request.id,
    orderId: request.orderId,
    orderNumber: request.order.orderNumber,
    orderName: request.order.orderName,
    orderStatus: request.order.status,
    customerId: request.order.customerId,
    requestType: request.requestType,
    status: request.status,
    previousOrderStatus: request.previousOrderStatus,
    policyStageKey: request.policyStageKey,
    remarks: request.remarks,
    decisionRemarks: request.decisionRemarks,
    contextSnapshot: request.contextSnapshot,
    refundMetadata: request.refundMetadata,
    reason: {
      id: request.reason.id,
      code: request.reason.code,
      label: request.reason.label,
    },
    requestedBy: {
      id: request.requestedBy.id,
      name: `${request.requestedBy.firstName} ${request.requestedBy.lastName}`.trim(),
      email: request.requestedBy.email,
    },
    decidedBy: request.decidedBy
      ? {
          id: request.decidedBy.id,
          name: `${request.decidedBy.firstName} ${request.decidedBy.lastName}`.trim(),
          email: request.decidedBy.email,
        }
      : null,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

const requestInclude = {
  reason: true,
  requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      orderName: true,
      status: true,
      customerId: true,
    },
  },
} as const;

export class OrderCancellationService {
  async listActiveReasons() {
    const reasons = await prisma.cancellationReason.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return reasons.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      description: r.description,
    }));
  }

  async getPolicyForOrder(orderId: string, userId: string, role: RoleName) {
    const order = await this.loadOrderForVendorOrStaff(orderId, userId, role);
    const [rules, pendingRequest] = await Promise.all([
      prisma.cancellationPolicyRule.findMany({ where: { isActive: true } }),
      prisma.orderCancellationRequest.findFirst({
        where: {
          orderId,
          status: OrderCancellationRequestStatus.PENDING,
        },
      }),
    ]);

    const policy = resolveCancellationPolicy(order.status, rules, {
      hasPendingRequest: Boolean(pendingRequest),
    });

    const stageKey = resolveStageFromOrderStatus(order.status);

    return {
      orderId: order.id,
      orderStatus: order.status,
      stageKey,
      policy,
      pendingRequest: pendingRequest
        ? {
            id: pendingRequest.id,
            status: pendingRequest.status,
            createdAt: pendingRequest.createdAt.toISOString(),
          }
        : null,
    };
  }

  async vendorDirectCancel(orderId: string, userId: string, input: VendorCancelInput) {
    const order = await this.assertVendorOwnsOrder(orderId, userId);
    await this.assertReasonActive(input.reasonId);

    const [rules, pendingRequest] = await Promise.all([
      prisma.cancellationPolicyRule.findMany({ where: { isActive: true } }),
      prisma.orderCancellationRequest.findFirst({
        where: { orderId, status: OrderCancellationRequestStatus.PENDING },
      }),
    ]);

    if (pendingRequest) {
      throw ApiError.conflict('A cancellation request is already pending for this order');
    }

    const policy = resolveCancellationPolicy(order.status, rules);
    if (!policy || policy.allowedAction !== CANCELLATION_ALLOWED_ACTION.DIRECT_CANCEL) {
      throw ApiError.forbidden(
        policy?.policyExplanation ?? 'Direct cancellation is not allowed at this stage',
      );
    }

    const contextSnapshot = await buildCancellationContextSnapshot(orderId);
    const reason = await prisma.cancellationReason.findUniqueOrThrow({
      where: { id: input.reasonId },
    });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.orderCancellationRequest.create({
        data: {
          orderId,
          requestedById: userId,
          reasonId: input.reasonId,
          remarks: input.remarks,
          status: OrderCancellationRequestStatus.APPROVED,
          requestType: OrderCancellationRequestType.DIRECT_CANCEL,
          previousOrderStatus: order.status,
          policyStageKey: policy.stageKey,
          contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
          decidedById: userId,
          decidedAt: new Date(),
        },
        include: requestInclude,
      });

      await tx.productionOrder.update({
        where: { id: orderId },
        data: { status: ProductionOrderStatus.CANCELLED },
      });

      const cancelledWorkflows = await this.cancelOrderWorkflows(orderId, userId, reason.label, tx);

      await recordOrderEvent(
        orderId,
        {
          eventType: CANCELLATION_EVENT_TYPES.VENDOR_DIRECT_CANCEL,
          title: 'Order cancelled by vendor',
          description: `Reason: ${reason.label}${input.remarks ? `. ${input.remarks}` : ''}`,
          metadata: {
            requestId: request.id,
            reasonCode: reason.code,
            policyStageKey: policy.stageKey,
          },
          actorId: userId,
        },
        tx,
      );

      return { request, cancelledWorkflows };
    }, CANCEL_TX_OPTIONS);

    for (const wf of result.cancelledWorkflows) {
      workflowEngine.publishCancellationEvents({
        workflowInstanceId: wf.workflowInstanceId,
        orderId,
        cancelledTaskIds: wf.cancelledTaskIds,
        actorId: userId,
      });
    }

    this.publishPostCancelSideEffects({
      orderId,
      customerId: order.customerId,
      previousStatus: order.status,
      actorId: userId,
      notificationType: CANCELLATION_NOTIFICATION_TYPES.ORDER_CANCELLED,
      notificationTitle: 'Order cancelled',
      notificationBody: `Order ${order.orderNumber} has been cancelled.`,
    });

    activityLogService.logAsync({
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'PRODUCTION_ORDER',
      entityId: orderId,
      actorId: userId,
      metadata: {
        from: order.status,
        to: ProductionOrderStatus.CANCELLED,
        cancellationRequestId: result.request.id,
        type: OrderCancellationRequestType.DIRECT_CANCEL,
      },
    });

    return mapRequestToDto(result.request);
  }

  async vendorRequestCancellation(
    orderId: string,
    userId: string,
    input: VendorRequestCancellationInput,
  ) {
    const order = await this.assertVendorOwnsOrder(orderId, userId);
    await this.assertReasonActive(input.reasonId);

    const [rules, pendingRequest] = await Promise.all([
      prisma.cancellationPolicyRule.findMany({ where: { isActive: true } }),
      prisma.orderCancellationRequest.findFirst({
        where: { orderId, status: OrderCancellationRequestStatus.PENDING },
      }),
    ]);

    if (pendingRequest) {
      throw ApiError.conflict('A cancellation request is already pending for this order');
    }

    const policy = resolveCancellationPolicy(order.status, rules);
    if (!policy || policy.allowedAction !== CANCELLATION_ALLOWED_ACTION.REQUEST_CANCELLATION) {
      throw ApiError.forbidden(
        policy?.policyExplanation ?? 'Cancellation request is not allowed at this stage',
      );
    }

    const contextSnapshot = await buildCancellationContextSnapshot(orderId);
    const reason = await prisma.cancellationReason.findUniqueOrThrow({
      where: { id: input.reasonId },
    });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.orderCancellationRequest.create({
        data: {
          orderId,
          requestedById: userId,
          reasonId: input.reasonId,
          remarks: input.remarks,
          status: OrderCancellationRequestStatus.PENDING,
          requestType: OrderCancellationRequestType.CANCELLATION_REQUEST,
          previousOrderStatus: order.status,
          policyStageKey: policy.stageKey,
          contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
        },
        include: requestInclude,
      });

      await tx.productionOrder.update({
        where: { id: orderId },
        data: { status: ProductionOrderStatus.CANCELLATION_REQUESTED },
      });

      await recordOrderEvent(
        orderId,
        {
          eventType: CANCELLATION_EVENT_TYPES.VENDOR_REQUESTED,
          title: 'Cancellation requested',
          description: `Reason: ${reason.label}${input.remarks ? `. ${input.remarks}` : ''}`,
          metadata: {
            requestId: request.id,
            reasonCode: reason.code,
            policyStageKey: policy.stageKey,
          },
          actorId: userId,
        },
        tx,
      );

      return request;
    }, CANCEL_TX_OPTIONS);

    emitOrderStatusChanged(orderId, order.customerId, {
      status: ProductionOrderStatus.CANCELLATION_REQUESTED,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emitEvent(APP_EVENTS.ORDER_STATUS_CHANGED, {
      orderId,
      from: order.status,
      to: ProductionOrderStatus.CANCELLATION_REQUESTED,
      actorId: userId,
    });

    await this.notifyProductionManagers({
      orderId,
      orderNumber: order.orderNumber,
      requestId: result.id,
      title: 'New cancellation request',
      body: `Order ${order.orderNumber} — vendor requested cancellation (${reason.label}).`,
      type: CANCELLATION_NOTIFICATION_TYPES.NEW_REQUEST_FOR_MANAGER,
    });

    void notifyUser(order.customerId, {
      type: CANCELLATION_NOTIFICATION_TYPES.REQUEST_SUBMITTED,
      title: 'Cancellation request submitted',
      body: `Your cancellation request for order ${order.orderNumber} is pending production review.`,
      entityType: 'ORDER_CANCELLATION_REQUEST',
      entityId: result.id,
      metadata: { orderId, orderNumber: order.orderNumber },
    });

    activityLogService.logAsync({
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'PRODUCTION_ORDER',
      entityId: orderId,
      actorId: userId,
      metadata: {
        from: order.status,
        to: ProductionOrderStatus.CANCELLATION_REQUESTED,
        cancellationRequestId: result.id,
        type: OrderCancellationRequestType.CANCELLATION_REQUEST,
      },
    });

    return mapRequestToDto(result);
  }

  async listRequests(query: ListCancellationRequestsQuery, role: RoleName, permissions: string[]) {
    assertCanManageProductionOrders(role, permissions);

    const where = {
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.orderCancellationRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.orderCancellationRequest.count({ where }),
    ]);

    return {
      items: items.map(mapRequestToDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getRequestById(requestId: string, userId: string, role: RoleName, permissions: string[]) {
    const request = await prisma.orderCancellationRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });

    if (!request) throw ApiError.notFound('Cancellation request not found');

    const isOwner = request.order.customerId === userId;
    const isStaff = canManageProductionOrders(role, permissions);

    if (!isOwner && !isStaff) {
      throw ApiError.forbidden('You do not have access to this cancellation request');
    }

    if (isStaff && request.status === OrderCancellationRequestStatus.PENDING) {
      await recordOrderEvent(request.orderId, {
        eventType: CANCELLATION_EVENT_TYPES.MANAGER_OPENED,
        title: 'Cancellation request reviewed',
        description: 'Production manager opened the cancellation request.',
        metadata: { requestId },
        actorId: userId,
      });
    }

    return mapRequestToDto(request);
  }

  async approveRequest(
    requestId: string,
    managerId: string,
    role: RoleName,
    permissions: string[],
    input: ApproveCancellationInput,
  ) {
    assertCanManageProductionOrders(role, permissions);

    const request = await prisma.orderCancellationRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });

    if (!request) throw ApiError.notFound('Cancellation request not found');
    if (request.status !== OrderCancellationRequestStatus.PENDING) {
      throw ApiError.conflict(`Request is already ${request.status.toLowerCase()}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.orderCancellationRequest.update({
        where: { id: requestId },
        data: {
          status: OrderCancellationRequestStatus.APPROVED,
          decidedById: managerId,
          decisionRemarks: input.decisionRemarks,
          decidedAt: new Date(),
        },
        include: requestInclude,
      });

      await tx.productionOrder.update({
        where: { id: request.orderId },
        data: { status: ProductionOrderStatus.CANCELLED },
      });

      const cancelledWorkflows = await this.cancelOrderWorkflows(
        request.orderId,
        managerId,
        input.decisionRemarks ?? 'Cancellation approved',
        tx,
      );

      await recordOrderEvent(
        request.orderId,
        {
          eventType: CANCELLATION_EVENT_TYPES.MANAGER_APPROVED,
          title: 'Cancellation approved',
          description: input.decisionRemarks ?? 'Production manager approved the cancellation request.',
          metadata: { requestId },
          actorId: managerId,
        },
        tx,
      );

      return { row, cancelledWorkflows };
    }, CANCEL_TX_OPTIONS);

    for (const wf of updated.cancelledWorkflows) {
      workflowEngine.publishCancellationEvents({
        workflowInstanceId: wf.workflowInstanceId,
        orderId: request.orderId,
        cancelledTaskIds: wf.cancelledTaskIds,
        actorId: managerId,
      });
    }

    this.publishPostCancelSideEffects({
      orderId: request.orderId,
      customerId: request.order.customerId,
      previousStatus: ProductionOrderStatus.CANCELLATION_REQUESTED,
      actorId: managerId,
      notificationType: CANCELLATION_NOTIFICATION_TYPES.REQUEST_APPROVED,
      notificationTitle: 'Cancellation approved',
      notificationBody: `Your cancellation request for order ${request.order.orderNumber} was approved. The order is now cancelled.`,
      requestId,
    });

    activityLogService.logAsync({
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'PRODUCTION_ORDER',
      entityId: request.orderId,
      actorId: managerId,
      metadata: {
        from: ProductionOrderStatus.CANCELLATION_REQUESTED,
        to: ProductionOrderStatus.CANCELLED,
        cancellationRequestId: requestId,
        decision: 'APPROVED',
      },
    });

    return mapRequestToDto(updated.row);
  }

  async rejectRequest(
    requestId: string,
    managerId: string,
    role: RoleName,
    permissions: string[],
    input: RejectCancellationInput,
  ) {
    assertCanManageProductionOrders(role, permissions);

    const request = await prisma.orderCancellationRequest.findUnique({
      where: { id: requestId },
      include: requestInclude,
    });

    if (!request) throw ApiError.notFound('Cancellation request not found');
    if (request.status !== OrderCancellationRequestStatus.PENDING) {
      throw ApiError.conflict(`Request is already ${request.status.toLowerCase()}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.orderCancellationRequest.update({
        where: { id: requestId },
        data: {
          status: OrderCancellationRequestStatus.REJECTED,
          decidedById: managerId,
          decisionRemarks: input.decisionRemarks,
          decidedAt: new Date(),
        },
        include: requestInclude,
      });

      await tx.productionOrder.update({
        where: { id: request.orderId },
        data: { status: request.previousOrderStatus },
      });

      await recordOrderEvent(
        request.orderId,
        {
          eventType: CANCELLATION_EVENT_TYPES.MANAGER_REJECTED,
          title: 'Cancellation rejected',
          description: input.decisionRemarks,
          metadata: { requestId },
          actorId: managerId,
        },
        tx,
      );

      return row;
    }, CANCEL_TX_OPTIONS);

    emitOrderStatusChanged(request.orderId, request.order.customerId, {
      status: request.previousOrderStatus,
      updatedAt: new Date().toISOString(),
    });

    void notifyUser(request.order.customerId, {
      type: CANCELLATION_NOTIFICATION_TYPES.REQUEST_REJECTED,
      title: 'Cancellation rejected',
      body: `Your cancellation request for order ${request.order.orderNumber} was rejected. Reason: ${input.decisionRemarks}`,
      entityType: 'ORDER_CANCELLATION_REQUEST',
      entityId: requestId,
      metadata: {
        orderId: request.orderId,
        orderNumber: request.order.orderNumber,
        decisionRemarks: input.decisionRemarks,
      },
    });

    activityLogService.logAsync({
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'PRODUCTION_ORDER',
      entityId: request.orderId,
      actorId: managerId,
      metadata: {
        from: ProductionOrderStatus.CANCELLATION_REQUESTED,
        to: request.previousOrderStatus,
        cancellationRequestId: requestId,
        decision: 'REJECTED',
      },
    });

    return mapRequestToDto(updated);
  }

  async adminOverrideCancel(
    orderId: string,
    adminId: string,
    role: RoleName,
    input: VendorCancelInput,
  ) {
    if (!MANAGER_ROLES.has(role)) {
      throw ApiError.forbidden('Only admin roles can override cancellation policy');
    }

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true, customerId: true },
    });

    if (!order) throw ApiError.notFound('Order not found');
    if (order.status === ProductionOrderStatus.CANCELLED) {
      throw ApiError.conflict('Order is already cancelled');
    }

    await this.assertReasonActive(input.reasonId);

    const contextSnapshot = await buildCancellationContextSnapshot(orderId);
    const reason = await prisma.cancellationReason.findUniqueOrThrow({
      where: { id: input.reasonId },
    });

    const stageKey =
      resolveStageFromOrderStatus(order.status) ?? 'PRODUCTION';

    await prisma.orderCancellationRequest.updateMany({
      where: { orderId, status: OrderCancellationRequestStatus.PENDING },
      data: {
        status: OrderCancellationRequestStatus.APPROVED,
        decidedById: adminId,
        decisionRemarks: 'Superseded by admin override cancellation',
        decidedAt: new Date(),
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.orderCancellationRequest.create({
        data: {
          orderId,
          requestedById: adminId,
          reasonId: input.reasonId,
          remarks: input.remarks,
          status: OrderCancellationRequestStatus.APPROVED,
          requestType: OrderCancellationRequestType.DIRECT_CANCEL,
          previousOrderStatus: order.status,
          policyStageKey: stageKey as never,
          contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
          decidedById: adminId,
          decidedAt: new Date(),
        },
        include: requestInclude,
      });

      await tx.productionOrder.update({
        where: { id: orderId },
        data: { status: ProductionOrderStatus.CANCELLED },
      });

      const cancelledWorkflows = await this.cancelOrderWorkflows(orderId, adminId, reason.label, tx);

      await recordOrderEvent(
        orderId,
        {
          eventType: CANCELLATION_EVENT_TYPES.ADMIN_OVERRIDE,
          title: 'Order cancelled (admin override)',
          description: `Reason: ${reason.label}${input.remarks ? `. ${input.remarks}` : ''}`,
          metadata: { requestId: request.id, reasonCode: reason.code },
          actorId: adminId,
        },
        tx,
      );

      return { request, cancelledWorkflows };
    }, CANCEL_TX_OPTIONS);

    for (const wf of result.cancelledWorkflows) {
      workflowEngine.publishCancellationEvents({
        workflowInstanceId: wf.workflowInstanceId,
        orderId,
        cancelledTaskIds: wf.cancelledTaskIds,
        actorId: adminId,
      });
    }

    this.publishPostCancelSideEffects({
      orderId,
      customerId: order.customerId,
      previousStatus: order.status,
      actorId: adminId,
      notificationType: CANCELLATION_NOTIFICATION_TYPES.ORDER_CANCELLED,
      notificationTitle: 'Order cancelled',
      notificationBody: `Order ${order.orderNumber} has been cancelled by administration.`,
    });

    return mapRequestToDto(result.request);
  }

  // --- Admin: reasons & policies ---

  async adminListReasons() {
    const reasons = await prisma.cancellationReason.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return reasons;
  }

  async adminCreateReason(data: {
    code: string;
    label: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.cancellationReason.create({ data });
  }

  async adminUpdateReason(
    id: string,
    data: Partial<{
      code: string;
      label: string;
      description: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return prisma.cancellationReason.update({ where: { id }, data });
  }

  async adminListPolicies() {
    return prisma.cancellationPolicyRule.findMany({
      orderBy: [{ sortOrder: 'asc' }],
    });
  }

  async adminUpsertPolicy(data: {
    stageKey: 'VERIFICATION' | 'ARTWORK_APPROVED' | 'PRODUCTION' | 'DISPATCH' | 'COMPLETED';
    label: string;
    vendorDirectCancel: boolean;
    vendorRequestAllowed: boolean;
    managerApprovalRequired: boolean;
    cancellationAllowed: boolean;
    policyExplanation?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.cancellationPolicyRule.upsert({
      where: { stageKey: data.stageKey },
      create: data,
      update: data,
    });
  }

  async getPendingCount(role: RoleName, permissions: string[]) {
    if (!canManageProductionOrders(role, permissions)) return { count: 0 };
    const count = await prisma.orderCancellationRequest.count({
      where: { status: OrderCancellationRequestStatus.PENDING },
    });
    return { count };
  }

  private async cancelOrderWorkflows(
    orderId: string,
    actorId: string | undefined,
    reason: string,
    tx: Prisma.TransactionClient,
  ): Promise<Array<{ workflowInstanceId: string; cancelledTaskIds: string[] }>> {
    const instances = await tx.workflowInstance.findMany({
      where: { orderId },
      select: { id: true },
    });

    const cancelled: Array<{ workflowInstanceId: string; cancelledTaskIds: string[] }> = [];

    for (const instance of instances) {
      const result = await workflowEngine.cancelInstance(
        {
          workflowInstanceId: instance.id,
          actorId,
          reason,
        },
        tx,
      );

      await recordOrderEvent(
        orderId,
        {
          eventType: CANCELLATION_EVENT_TYPES.WORKFLOW_CANCELLED,
          title: 'Production workflow cancelled',
          description: `${result.cancelledTaskIds.length} task(s) cancelled.`,
          metadata: {
            workflowInstanceId: instance.id,
            cancelledTaskIds: result.cancelledTaskIds,
          },
          actorId,
        },
        tx,
      );

      cancelled.push(result);
    }

    return cancelled;
  }

  private publishPostCancelSideEffects(input: {
    orderId: string;
    customerId: string;
    previousStatus: ProductionOrderStatus;
    actorId: string;
    notificationType: string;
    notificationTitle: string;
    notificationBody: string;
    requestId?: string;
  }) {
    emitOrderStatusChanged(input.orderId, input.customerId, {
      status: ProductionOrderStatus.CANCELLED,
      updatedAt: new Date().toISOString(),
    });

    eventBus.emitEvent(APP_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: input.orderId,
      from: input.previousStatus,
      to: ProductionOrderStatus.CANCELLED,
      actorId: input.actorId,
    });

    void notifyUser(input.customerId, {
      type: input.notificationType,
      title: input.notificationTitle,
      body: input.notificationBody,
      entityType: 'PRODUCTION_ORDER',
      entityId: input.orderId,
      metadata: { requestId: input.requestId },
    });
  }

  private async notifyProductionManagers(input: {
    orderId: string;
    orderNumber: string;
    requestId: string;
    title: string;
    body: string;
    type: string;
  }) {
    const managers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        role: { name: { in: [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MANAGER] } },
      },
      select: { id: true },
    });

    await Promise.all(
      managers.map((m) =>
        notifyUser(m.id, {
          type: input.type,
          title: input.title,
          body: input.body,
          entityType: 'ORDER_CANCELLATION_REQUEST',
          entityId: input.requestId,
          metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
        }),
      ),
    );
  }

  private async assertReasonActive(reasonId: string) {
    const reason = await prisma.cancellationReason.findUnique({ where: { id: reasonId } });
    if (!reason || !reason.isActive) {
      throw ApiError.badRequest('Invalid or inactive cancellation reason');
    }
    return reason;
  }

  private async assertVendorOwnsOrder(orderId: string, userId: string) {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, orderNumber: true, status: true },
    });

    if (!order) throw ApiError.notFound('Order not found');
    if (order.customerId !== userId) {
      throw ApiError.forbidden('You can only cancel your own orders');
    }
    if (order.status === ProductionOrderStatus.CANCELLED) {
      throw ApiError.conflict('Order is already cancelled');
    }

    return order;
  }

  private async loadOrderForVendorOrStaff(orderId: string, userId: string, role: RoleName) {
    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, status: true, orderNumber: true },
    });

    if (!order) throw ApiError.notFound('Order not found');

    const isStaff = MANAGER_ROLES.has(role);
    if (!isStaff && order.customerId !== userId) {
      throw ApiError.forbidden('You do not have access to this order');
    }

    return order;
  }
}

export const orderCancellationService = new OrderCancellationService();
