import {
  ProductionOrderStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';

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
  [WorkflowStepType.DISPATCH]: ProductionOrderStatus.READY_FOR_DISPATCH,
};

const STATUS_RANK: Record<string, number> = {
  [ProductionOrderStatus.ORDER_PLACED]: 0,
  [ProductionOrderStatus.PENDING_PAYMENT]: 1,
  [ProductionOrderStatus.UNDER_ARTWORK_REVIEW]: 2,
  [ProductionOrderStatus.ARTWORK_APPROVED]: 3,
  [ProductionOrderStatus.CONFIRMED]: 4,
  [ProductionOrderStatus.IN_PRODUCTION]: 5,
  [ProductionOrderStatus.QUALITY_CHECK]: 6,
  [ProductionOrderStatus.READY_FOR_DISPATCH]: 7,
};

const SYNCABLE_STATUSES = new Set<ProductionOrderStatus>([
  ProductionOrderStatus.ORDER_PLACED,
  ProductionOrderStatus.UNDER_ARTWORK_REVIEW,
  ProductionOrderStatus.ARTWORK_APPROVED,
  ProductionOrderStatus.CONFIRMED,
  ProductionOrderStatus.IN_PRODUCTION,
  ProductionOrderStatus.QUALITY_CHECK,
]);

/**
 * After a workflow task completes, derive the order's production stage from the
 * highest-priority active (READY/ASSIGNED/IN_PROGRESS) task across all workflow
 * instances. This keeps the vendor-facing order status in sync with actual
 * production progress.
 *
 * Only advances status forward — never rolls it back (except via rework, which
 * is handled separately by dispatch-readiness).
 */
export async function syncOrderStatusFromWorkflow(workflowInstanceId: string): Promise<void> {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: workflowInstanceId },
    select: { orderId: true },
  });
  if (!instance) return;

  const order = await prisma.productionOrder.findUnique({
    where: { id: instance.orderId },
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
        ],
      },
    },
    select: {
      workflowStep: { select: { stepType: true } },
    },
  });

  if (activeTasks.length === 0) return;

  let highestStatus: ProductionOrderStatus | null = null;
  let highestRank = -1;

  for (const task of activeTasks) {
    const mapped = STEP_TYPE_TO_ORDER_STATUS[task.workflowStep.stepType];
    if (!mapped) continue;
    const rank = STATUS_RANK[mapped] ?? -1;
    if (rank > highestRank) {
      highestRank = rank;
      highestStatus = mapped;
    }
  }

  if (!highestStatus) return;

  const currentRank = STATUS_RANK[order.status] ?? -1;
  if (highestRank <= currentRank) return;

  await prisma.productionOrder.update({
    where: { id: order.id },
    data: { status: highestStatus },
  });

  logger.info('Order status synced from workflow', {
    orderId: order.id,
    from: order.status,
    to: highestStatus,
  });
}
