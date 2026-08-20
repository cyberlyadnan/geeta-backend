import { WorkflowTaskStatus } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';

const TERMINAL: ReadonlySet<WorkflowTaskStatus> = new Set([
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.CANCELLED,
  WorkflowTaskStatus.SKIPPED,
]);

/** Validated enterprise task transitions (Milestone 1). */
const TRANSITIONS: Readonly<Record<WorkflowTaskStatus, readonly WorkflowTaskStatus[]>> = {
  [WorkflowTaskStatus.PENDING]: [
    WorkflowTaskStatus.BLOCKED,
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.CANCELLED,
  ],
  [WorkflowTaskStatus.WAITING]: [
    WorkflowTaskStatus.BLOCKED,
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.CANCELLED,
  ],
  [WorkflowTaskStatus.BLOCKED]: [
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.CANCELLED,
    WorkflowTaskStatus.SKIPPED,
  ],
  [WorkflowTaskStatus.READY]: [
    WorkflowTaskStatus.ASSIGNED,
    WorkflowTaskStatus.IN_PROGRESS,
    WorkflowTaskStatus.COMPLETED,
    WorkflowTaskStatus.BLOCKED,
    WorkflowTaskStatus.CANCELLED,
    WorkflowTaskStatus.SKIPPED,
  ],
  [WorkflowTaskStatus.ASSIGNED]: [
    WorkflowTaskStatus.IN_PROGRESS,
    WorkflowTaskStatus.COMPLETED,
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.BLOCKED,
    WorkflowTaskStatus.CANCELLED,
  ],
  [WorkflowTaskStatus.IN_PROGRESS]: [
    WorkflowTaskStatus.COMPLETED,
    WorkflowTaskStatus.PAUSED,
    WorkflowTaskStatus.ON_HOLD,
    WorkflowTaskStatus.REJECTED,
    WorkflowTaskStatus.REWORK,
    WorkflowTaskStatus.BLOCKED,
    WorkflowTaskStatus.CANCELLED,
  ],
  [WorkflowTaskStatus.PAUSED]: [
    WorkflowTaskStatus.IN_PROGRESS,
    WorkflowTaskStatus.CANCELLED,
    WorkflowTaskStatus.BLOCKED,
  ],
  [WorkflowTaskStatus.ON_HOLD]: [
    WorkflowTaskStatus.IN_PROGRESS,
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.CANCELLED,
    WorkflowTaskStatus.BLOCKED,
  ],
  [WorkflowTaskStatus.REJECTED]: [
    WorkflowTaskStatus.REWORK,
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.CANCELLED,
  ],
  [WorkflowTaskStatus.REWORK]: [
    WorkflowTaskStatus.READY,
    WorkflowTaskStatus.IN_PROGRESS,
    WorkflowTaskStatus.CANCELLED,
  ],
  [WorkflowTaskStatus.COMPLETED]: [],
  [WorkflowTaskStatus.CANCELLED]: [],
  [WorkflowTaskStatus.SKIPPED]: [],
};

export function assertTaskTransition(from: WorkflowTaskStatus, to: WorkflowTaskStatus): void {
  if (from === to) return;

  if (TERMINAL.has(from)) {
    throw ApiError.conflict(`Task in terminal state ${from} cannot transition to ${to}`);
  }

  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(`Illegal task transition: ${from} → ${to}`);
  }
}

export function isTaskTerminal(status: WorkflowTaskStatus): boolean {
  return TERMINAL.has(status);
}

export function isTaskDependencySatisfied(
  dependencyType: 'FINISH_TO_START' | 'START_TO_START',
  prerequisiteStatus: WorkflowTaskStatus,
): boolean {
  if (dependencyType === 'START_TO_START') {
    return (
      prerequisiteStatus === WorkflowTaskStatus.IN_PROGRESS ||
      prerequisiteStatus === WorkflowTaskStatus.COMPLETED ||
      prerequisiteStatus === WorkflowTaskStatus.SKIPPED
    );
  }

  return (
    prerequisiteStatus === WorkflowTaskStatus.COMPLETED ||
    prerequisiteStatus === WorkflowTaskStatus.SKIPPED
  );
}
