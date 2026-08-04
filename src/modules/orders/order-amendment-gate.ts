import { ProductionOrderStatus, WorkflowTaskStatus } from '@prisma/client';

export interface AmendabilityCheck {
  amendable: boolean;
  reason?: string;
}

/** An order in any of these statuses is closed out — amending it would rewrite settled history. */
const TERMINAL_ORDER_STATUSES: ReadonlySet<ProductionOrderStatus> = new Set([
  ProductionOrderStatus.CANCELLED,
  ProductionOrderStatus.CANCELLATION_REQUESTED,
  ProductionOrderStatus.COMPLETED,
  ProductionOrderStatus.DISPATCHED,
  ProductionOrderStatus.DELIVERED,
]);

/** A task in any of these statuses hasn't actually begun — still just queued. */
const NOT_STARTED_TASK_STATUSES: ReadonlySet<WorkflowTaskStatus> = new Set([
  WorkflowTaskStatus.BLOCKED,
  WorkflowTaskStatus.PENDING,
  WorkflowTaskStatus.WAITING,
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.ASSIGNED,
]);

function humanizeStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/**
 * Whether an order can still be amended — reads the amendment cutoff from the order's own
 * workflow template (WorkflowTemplateStep.locksAmendmentsOnStart) rather than a hardcoded list
 * of order statuses, so it stays correct as new product types / templates are added. A product
 * whose template flags no step at all stays amendable at any (non-terminal) stage.
 */
export function checkOrderAmendable(input: {
  orderStatus: ProductionOrderStatus;
  workflowTasks: Array<{
    status: WorkflowTaskStatus;
    workflowStep: { locksAmendmentsOnStart: boolean; stepName: string };
  }>;
}): AmendabilityCheck {
  if (TERMINAL_ORDER_STATUSES.has(input.orderStatus)) {
    return {
      amendable: false,
      reason: `Order is ${humanizeStatus(input.orderStatus)} and can no longer be amended`,
    };
  }

  const lockingStartedTask = input.workflowTasks.find(
    (task) => task.workflowStep.locksAmendmentsOnStart && !NOT_STARTED_TASK_STATUSES.has(task.status),
  );

  if (lockingStartedTask) {
    return {
      amendable: false,
      reason: `Amendments are no longer allowed once "${lockingStartedTask.workflowStep.stepName}" has started`,
    };
  }

  return { amendable: true };
}
