import {
  WorkflowTaskExecutionSessionStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';

const SESSION_TRANSITIONS: Readonly<
  Record<WorkflowTaskExecutionSessionStatus, readonly WorkflowTaskExecutionSessionStatus[]>
> = {
  [WorkflowTaskExecutionSessionStatus.IN_PROGRESS]: [
    WorkflowTaskExecutionSessionStatus.PAUSED,
    WorkflowTaskExecutionSessionStatus.ON_HOLD,
    WorkflowTaskExecutionSessionStatus.COMPLETED,
  ],
  [WorkflowTaskExecutionSessionStatus.PAUSED]: [
    WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
  ],
  [WorkflowTaskExecutionSessionStatus.ON_HOLD]: [
    WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
  ],
  [WorkflowTaskExecutionSessionStatus.COMPLETED]: [],
};

export function assertSessionTransition(
  from: WorkflowTaskExecutionSessionStatus,
  to: WorkflowTaskExecutionSessionStatus,
): void {
  if (from === to) return;
  const allowed = SESSION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.conflict(`Illegal execution session transition: ${from} → ${to}`);
  }
}

export function taskStatusForSessionStart(current: WorkflowTaskStatus): WorkflowTaskStatus {
  if (current === WorkflowTaskStatus.ASSIGNED || current === WorkflowTaskStatus.READY) {
    return WorkflowTaskStatus.IN_PROGRESS;
  }
  throw ApiError.conflict(`Task must be ASSIGNED or READY to start (current: ${current})`);
}

export function assertTaskStatusForPause(status: WorkflowTaskStatus): void {
  if (status !== WorkflowTaskStatus.IN_PROGRESS) {
    throw ApiError.conflict(`Task must be IN_PROGRESS to pause (current: ${status})`);
  }
}

export function assertTaskStatusForResume(status: WorkflowTaskStatus): void {
  if (status !== WorkflowTaskStatus.PAUSED && status !== WorkflowTaskStatus.ON_HOLD) {
    throw ApiError.conflict(`Task must be PAUSED or ON_HOLD to resume (current: ${status})`);
  }
}

export function assertTaskStatusForHold(status: WorkflowTaskStatus): void {
  if (status !== WorkflowTaskStatus.IN_PROGRESS) {
    throw ApiError.conflict(`Task must be IN_PROGRESS to hold (current: ${status})`);
  }
}

export function assertTaskStatusForComplete(status: WorkflowTaskStatus): void {
  if (status !== WorkflowTaskStatus.IN_PROGRESS) {
    throw ApiError.conflict(`Task must be IN_PROGRESS to complete (current: ${status})`);
  }
}
