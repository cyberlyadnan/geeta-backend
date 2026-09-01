import {
  ProductionOrderStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';
import {
  hasOpenDispatchWork,
  isPreDispatchProductionComplete,
} from '../workflow/workflow-dispatch.util.js';

/** Department code that identifies design work, independent of step type — a VENDOR_APPROVAL
 *  gate is design-stage work when it belongs to Design (proof/sample approval) but review-stage
 *  work when it belongs elsewhere, so step type alone can't disambiguate. */
const DESIGN_DEPARTMENT_CODE = 'DESIGN';

const STEP_TYPE_TO_ORDER_STATUS: Partial<Record<WorkflowStepType, ProductionOrderStatus>> = {
  [WorkflowStepType.VERIFICATION]: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  [WorkflowStepType.VENDOR_APPROVAL]: ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  [WorkflowStepType.PRINTING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.LAMINATION]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.UV]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.FOILING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.DIE_CUTTING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.PACKAGING]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.CUSTOM]: ProductionOrderStatus.IN_PRODUCTION,
  [WorkflowStepType.QUALITY_CHECK]: ProductionOrderStatus.QUALITY_CHECK,
};

const STATUS_RANK: Record<string, number> = {
  [ProductionOrderStatus.ORDER_PLACED]: 0,
  [ProductionOrderStatus.PENDING_PAYMENT]: 1,
  [ProductionOrderStatus.DESIGN]: 2,
  [ProductionOrderStatus.UNDER_ARTWORK_REVIEW]: 3,
  [ProductionOrderStatus.ARTWORK_APPROVED]: 4,
  [ProductionOrderStatus.CONFIRMED]: 5,
  [ProductionOrderStatus.IN_PRODUCTION]: 6,
  [ProductionOrderStatus.QUALITY_CHECK]: 7,
  [ProductionOrderStatus.READY_FOR_DISPATCH]: 8,
};

const SYNCABLE_STATUSES = new Set<ProductionOrderStatus>([
  ProductionOrderStatus.ORDER_PLACED,
  ProductionOrderStatus.DESIGN,
  ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  ProductionOrderStatus.IMPROPER_ORDER,
  ProductionOrderStatus.ARTWORK_APPROVED,
  ProductionOrderStatus.CONFIRMED,
  ProductionOrderStatus.IN_PRODUCTION,
  ProductionOrderStatus.QUALITY_CHECK,
]);

/**
 * After a workflow task changes, derive the order's production stage from its active tasks
 * across all workflow instances. This keeps the vendor-facing order status in sync with actual
 * production progress.
 *
 * Two things take priority over the normal forward-only ranking:
 *  - A VERIFICATION-step task sitting BLOCKED means Under Review staff flagged the order for
 *    correction — the order is IMPROPER_ORDER regardless of what rank that would otherwise be.
 *  - Otherwise, advances forward only (never rolls back) using the highest-ranked active task,
 *    with VENDOR_APPROVAL/CUSTOM tasks in the DESIGN department reported as DESIGN rather than
 *    the generic UNDER_ARTWORK_REVIEW/IN_PRODUCTION step-type mapping.
 *
 * Once the flagged task moves back to READY (via resolveTaskCorrection), a later call naturally
 * re-ranks it as UNDER_ARTWORK_REVIEW like any other active Verification task — no special
 * "un-flag" step needed here.
 */
export async function syncOrderStatusFromWorkflow(workflowInstanceId: string): Promise<void> {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: workflowInstanceId },
    select: { orderId: true },
  });
  if (!instance) return;
  await syncOrderStatusForOrder(instance.orderId);
}

export async function syncOrderStatusForOrder(orderId: string): Promise<void> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) return;

  if (!SYNCABLE_STATUSES.has(order.status)) return;

  const activeTasks = await prisma.workflowTask.findMany({
    where: {
      workflowInstance: { orderId: order.id },
      status: {
        in: [
          WorkflowTaskStatus.READY,
          WorkflowTaskStatus.ASSIGNED,
          WorkflowTaskStatus.IN_PROGRESS,
          WorkflowTaskStatus.REWORK,
          WorkflowTaskStatus.BLOCKED,
        ],
      },
    },
    select: {
      status: true,
      workflowStep: { select: { stepType: true } },
      department: { select: { code: true } },
    },
  });

  if (activeTasks.length === 0) return;

  const flaggedForCorrection = activeTasks.some(
    (t) => t.status === WorkflowTaskStatus.BLOCKED && t.workflowStep.stepType === WorkflowStepType.VERIFICATION,
  );

  let nextStatus: ProductionOrderStatus | null = null;

  if (flaggedForCorrection) {
    nextStatus = ProductionOrderStatus.IMPROPER_ORDER;
  } else {
    let highestRank = -1;
    for (const task of activeTasks) {
      if (task.status === WorkflowTaskStatus.BLOCKED) continue; // BLOCKED elsewhere is someone else's rework wait, not a stage signal here
      const isDesignWork =
        task.department.code === DESIGN_DEPARTMENT_CODE &&
        (task.workflowStep.stepType === WorkflowStepType.VENDOR_APPROVAL ||
          task.workflowStep.stepType === WorkflowStepType.CUSTOM);
      const mapped = isDesignWork
        ? ProductionOrderStatus.DESIGN
        : STEP_TYPE_TO_ORDER_STATUS[task.workflowStep.stepType];
      if (!mapped) continue;
      const rank = STATUS_RANK[mapped] ?? -1;
      if (rank > highestRank) {
        highestRank = rank;
        nextStatus = mapped;
      }
    }
  }

  if (!nextStatus || nextStatus === order.status) {
    if (
      SYNCABLE_STATUSES.has(order.status) &&
      order.status !== ProductionOrderStatus.READY_FOR_DISPATCH
    ) {
      const instances = await prisma.workflowInstance.findMany({
        where: { orderId: order.id },
        select: {
          status: true,
          tasks: {
            select: {
              status: true,
              workflowStep: { select: { stepType: true, stepCode: true } },
            },
          },
        },
      });
      const awaitingDispatch = instances.some(
        (instance) =>
          isPreDispatchProductionComplete(instance.tasks, instance.status) &&
          hasOpenDispatchWork(instance.tasks),
      );
      if (awaitingDispatch) {
        await prisma.productionOrder.update({
          where: { id: order.id },
          data: { status: ProductionOrderStatus.READY_FOR_DISPATCH },
        });
        logger.info('Order status synced to ready for dispatch', {
          orderId: order.id,
          from: order.status,
        });
      }
    }
    return;
  }

  const currentRank = STATUS_RANK[order.status] ?? -1;
  const nextRank = STATUS_RANK[nextStatus] ?? -1;
  // IMPROPER_ORDER is a hold state, not a forward step — allowed to interrupt the normal
  // forward-only rule. Recovering from it (nextStatus rank <= currentRank once un-flagged) is
  // also allowed since IMPROPER_ORDER itself is exempt from ranking.
  const isTransitionAllowed =
    nextStatus === ProductionOrderStatus.IMPROPER_ORDER ||
    order.status === ProductionOrderStatus.IMPROPER_ORDER ||
    nextRank > currentRank;
  if (!isTransitionAllowed) return;

  // Production finished and dispatch dept owns the order — show on Ready for Dispatch, not Production.
  const instances = await prisma.workflowInstance.findMany({
    where: { orderId: order.id },
    select: {
      status: true,
      tasks: {
        select: {
          status: true,
          workflowStep: { select: { stepType: true, stepCode: true } },
        },
      },
    },
  });
  const awaitingDispatch = instances.some(
    (instance) =>
      isPreDispatchProductionComplete(instance.tasks, instance.status) &&
      hasOpenDispatchWork(instance.tasks),
  );
  const readyForDispatchRank = STATUS_RANK[ProductionOrderStatus.READY_FOR_DISPATCH] ?? 8;
  if (awaitingDispatch && (STATUS_RANK[nextStatus] ?? -1) < readyForDispatchRank) {
    nextStatus = ProductionOrderStatus.READY_FOR_DISPATCH;
  }

  await prisma.productionOrder.update({
    where: { id: order.id },
    data: { status: nextStatus },
  });

  logger.info('Order status synced from workflow', {
    orderId: order.id,
    from: order.status,
    to: nextStatus,
  });
}
