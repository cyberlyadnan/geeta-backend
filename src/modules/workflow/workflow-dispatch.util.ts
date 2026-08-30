import { WorkflowStepType, WorkflowTaskStatus, type WorkflowTask } from '@prisma/client';

/** Terminal states — the step is finished and no longer blocks downstream work. */
export const WORKFLOW_TASK_TERMINAL_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.SKIPPED,
  WorkflowTaskStatus.CANCELLED,
];

type DispatchStepRef = {
  stepType: WorkflowStepType | string;
  stepCode?: string | null;
};

type TaskWithStep = Pick<WorkflowTask, 'status'> & {
  workflowStep: DispatchStepRef;
};

export function isDispatchWorkflowStep(step: DispatchStepRef): boolean {
  return (
    step.stepType === WorkflowStepType.DISPATCH ||
    step.stepCode === 'DISPATCH' ||
    (step.stepCode?.includes('DISPATCH') ?? false)
  );
}

export function isWorkflowTaskTerminal(status: WorkflowTaskStatus): boolean {
  return WORKFLOW_TASK_TERMINAL_STATUSES.includes(status);
}

/** True when every pre-dispatch step on the instance has finished (or was skipped). */
export function isPreDispatchProductionComplete(
  tasks: TaskWithStep[],
  instanceStatus?: string,
): boolean {
  const nonDispatch = tasks.filter((t) => !isDispatchWorkflowStep(t.workflowStep));
  if (nonDispatch.length === 0) {
    return instanceStatus === 'COMPLETED';
  }
  return nonDispatch.every((t) => isWorkflowTaskTerminal(t.status));
}

/** True when dispatch workflow work is still open (not yet completed/skipped). */
export function hasOpenDispatchWork(tasks: TaskWithStep[]): boolean {
  return tasks.some(
    (t) => isDispatchWorkflowStep(t.workflowStep) && !isWorkflowTaskTerminal(t.status),
  );
}
