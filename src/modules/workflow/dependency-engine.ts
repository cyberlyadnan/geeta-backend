import type { WorkflowStepDependencyType, WorkflowTaskStatus } from '@prisma/client';
import { isTaskDependencySatisfied } from './task-state-machine.js';

export interface TemplateStepRef {
  id: string;
  stepOrder: number;
  isMandatory: boolean;
  allowSkip: boolean;
}

export interface TemplateDependencyEdge {
  workflowTemplateStepId: string;
  dependsOnStepId: string;
  dependencyType: WorkflowStepDependencyType;
}

export interface TaskRef {
  id: string;
  templateStepId: string;
}

export interface TaskDependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: WorkflowStepDependencyType;
}

export interface TaskStatusSnapshot {
  id: string;
  status: WorkflowTaskStatus;
}

/**
 * Builds implicit sequential FINISH_TO_START chain when template has no explicit dependencies.
 */
export function buildImplicitTemplateDependencies(steps: TemplateStepRef[]): TemplateDependencyEdge[] {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const edges: TemplateDependencyEdge[] = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    if (!current || !previous) continue;

    edges.push({
      workflowTemplateStepId: current.id,
      dependsOnStepId: previous.id,
      dependencyType: 'FINISH_TO_START',
    });
  }

  return edges;
}

/**
 * If explicit template dependencies exist, use them exclusively.
 * Otherwise fall back to implicit sequential chain.
 */
export function resolveTemplateDependencies(
  steps: TemplateStepRef[],
  explicit: TemplateDependencyEdge[],
): TemplateDependencyEdge[] {
  if (explicit.length > 0) {
    return explicit;
  }
  return buildImplicitTemplateDependencies(steps);
}

export function mapTemplateDependenciesToTasks(
  templateDeps: TemplateDependencyEdge[],
  stepIdToTaskId: Map<string, string>,
): TaskDependencyEdge[] {
  const edges: TaskDependencyEdge[] = [];

  for (const dep of templateDeps) {
    const taskId = stepIdToTaskId.get(dep.workflowTemplateStepId);
    const dependsOnTaskId = stepIdToTaskId.get(dep.dependsOnStepId);
    if (!taskId || !dependsOnTaskId) continue;

    edges.push({
      taskId,
      dependsOnTaskId,
      dependencyType: dep.dependencyType,
    });
  }

  return edges;
}

/**
 * Determines whether a task's dependencies are satisfied.
 */
export function areTaskDependenciesMet(
  taskId: string,
  dependencies: TaskDependencyEdge[],
  statusByTaskId: Map<string, WorkflowTaskStatus>,
): boolean {
  const incoming = dependencies.filter((d) => d.taskId === taskId);
  if (incoming.length === 0) return true;

  return incoming.every((dep) => {
    const prerequisiteStatus = statusByTaskId.get(dep.dependsOnTaskId);
    if (!prerequisiteStatus) return false;
    return isTaskDependencySatisfied(dep.dependencyType, prerequisiteStatus);
  });
}

/**
 * Returns task IDs that should become READY given current statuses.
 */
export function resolveReadyTaskIds(
  tasks: TaskRef[],
  dependencies: TaskDependencyEdge[],
  statusByTaskId: Map<string, WorkflowTaskStatus>,
  onlyBlocked = true,
): string[] {
  const ready: string[] = [];

  for (const task of tasks) {
    const current = statusByTaskId.get(task.id);
    if (!current) continue;
    if (onlyBlocked && current !== 'BLOCKED' && current !== 'WAITING' && current !== 'PENDING') {
      continue;
    }

    if (areTaskDependenciesMet(task.id, dependencies, statusByTaskId)) {
      ready.push(task.id);
    }
  }

  return ready;
}
