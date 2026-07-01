import { WorkflowInstanceStatus } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';

const TERMINAL: ReadonlySet<WorkflowInstanceStatus> = new Set([
  WorkflowInstanceStatus.COMPLETED,
  WorkflowInstanceStatus.CANCELLED,
  WorkflowInstanceStatus.FAILED,
]);

const TRANSITIONS: Readonly<Record<WorkflowInstanceStatus, readonly WorkflowInstanceStatus[]>> = {
  [WorkflowInstanceStatus.DRAFT]: [WorkflowInstanceStatus.INITIALIZED, WorkflowInstanceStatus.CANCELLED],
  [WorkflowInstanceStatus.INITIALIZED]: [
    WorkflowInstanceStatus.RUNNING,
    WorkflowInstanceStatus.CANCELLED,
    WorkflowInstanceStatus.FAILED,
  ],
  [WorkflowInstanceStatus.RUNNING]: [
    WorkflowInstanceStatus.PAUSED,
    WorkflowInstanceStatus.COMPLETED,
    WorkflowInstanceStatus.CANCELLED,
    WorkflowInstanceStatus.FAILED,
  ],
  [WorkflowInstanceStatus.PAUSED]: [
    WorkflowInstanceStatus.RUNNING,
    WorkflowInstanceStatus.CANCELLED,
    WorkflowInstanceStatus.FAILED,
  ],
  [WorkflowInstanceStatus.COMPLETED]: [],
  [WorkflowInstanceStatus.CANCELLED]: [],
  [WorkflowInstanceStatus.FAILED]: [],
  // Legacy aliases
  [WorkflowInstanceStatus.READY]: [
    WorkflowInstanceStatus.INITIALIZED,
    WorkflowInstanceStatus.RUNNING,
    WorkflowInstanceStatus.CANCELLED,
  ],
  [WorkflowInstanceStatus.IN_PROGRESS]: [
    WorkflowInstanceStatus.RUNNING,
    WorkflowInstanceStatus.PAUSED,
    WorkflowInstanceStatus.COMPLETED,
    WorkflowInstanceStatus.CANCELLED,
    WorkflowInstanceStatus.FAILED,
  ],
  [WorkflowInstanceStatus.ON_HOLD]: [
    WorkflowInstanceStatus.PAUSED,
    WorkflowInstanceStatus.RUNNING,
    WorkflowInstanceStatus.CANCELLED,
  ],
};

export function assertWorkflowInstanceTransition(
  from: WorkflowInstanceStatus,
  to: WorkflowInstanceStatus,
): void {
  if (from === to) return;

  if (TERMINAL.has(from)) {
    throw ApiError.conflict(`Workflow in terminal state ${from} cannot transition to ${to}`);
  }

  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(`Illegal workflow transition: ${from} → ${to}`);
  }
}

export function isWorkflowTerminal(status: WorkflowInstanceStatus): boolean {
  return TERMINAL.has(status);
}

export function normalizeWorkflowStatus(status: WorkflowInstanceStatus): WorkflowInstanceStatus {
  switch (status) {
    case WorkflowInstanceStatus.READY:
      return WorkflowInstanceStatus.INITIALIZED;
    case WorkflowInstanceStatus.IN_PROGRESS:
      return WorkflowInstanceStatus.RUNNING;
    case WorkflowInstanceStatus.ON_HOLD:
      return WorkflowInstanceStatus.PAUSED;
    default:
      return status;
  }
}
