import type { Prisma, WorkflowPriority, WorkflowTaskStatus } from '@prisma/client';
import type { WorkflowTemplateWithSteps } from './workflow.repository.js';
import {
  mapTemplateDependenciesToTasks,
  resolveTemplateDependencies,
  type TaskDependencyEdge,
  type TemplateDependencyEdge,
} from './dependency-engine.js';

export interface GeneratedTaskPayload {
  workflowInstanceId: string;
  workflowTemplateStepId: string;
  departmentId: string;
  stepOrder: number;
  priority: WorkflowPriority;
  estimatedMinutes: number;
  instructions: string | null;
  metadata: Prisma.InputJsonValue;
  status: WorkflowTaskStatus;
}

export interface TaskGenerationResult {
  taskPayloads: GeneratedTaskPayload[];
  templateDependencies: TemplateDependencyEdge[];
  taskDependencies: TaskDependencyEdge[];
  stepIdToTaskId: Map<string, string>;
  createdTasks: Array<{ id: string; workflowTemplateStepId: string; stepOrder: number }>;
}

export function buildTaskPayloads(
  workflowInstanceId: string,
  template: WorkflowTemplateWithSteps,
  initialStatus: WorkflowTaskStatus = 'BLOCKED',
): GeneratedTaskPayload[] {
  return template.steps.map((step) => ({
    workflowInstanceId,
    workflowTemplateStepId: step.id,
    departmentId: step.departmentId,
    stepOrder: step.stepOrder,
    priority: 'NORMAL' as WorkflowPriority,
    estimatedMinutes: step.expectedMinutes,
    instructions: step.instructions,
    metadata: (step.metadata ?? {}) as Prisma.InputJsonValue,
    status: initialStatus,
  }));
}

export function collectExplicitTemplateDependencies(
  template: WorkflowTemplateWithSteps,
): TemplateDependencyEdge[] {
  const edges: TemplateDependencyEdge[] = [];

  for (const step of template.steps) {
    for (const dep of step.dependencies) {
      edges.push({
        workflowTemplateStepId: dep.workflowTemplateStepId,
        dependsOnStepId: dep.dependsOnStepId,
        dependencyType: dep.dependencyType,
      });
    }
  }

  return edges;
}

export function mapCreatedTasksToDependencies(
  template: WorkflowTemplateWithSteps,
  createdTasks: Array<{ id: string; workflowTemplateStepId: string }>,
): TaskDependencyEdge[] {
  const stepIdToTaskId = new Map(
    createdTasks.map((task) => [task.workflowTemplateStepId, task.id]),
  );

  const explicit = collectExplicitTemplateDependencies(template);
  const templateDeps = resolveTemplateDependencies(
    template.steps.map((step) => ({
      id: step.id,
      stepOrder: step.stepOrder,
      isMandatory: step.isMandatory,
      allowSkip: step.allowSkip,
    })),
    explicit,
  );

  return mapTemplateDependenciesToTasks(templateDeps, stepIdToTaskId);
}

export class TaskGeneratorService {
  buildPayloads(
    workflowInstanceId: string,
    template: WorkflowTemplateWithSteps,
  ): GeneratedTaskPayload[] {
    return buildTaskPayloads(workflowInstanceId, template);
  }

  resolveDependencies(
    template: WorkflowTemplateWithSteps,
    createdTasks: Array<{ id: string; workflowTemplateStepId: string }>,
  ): TaskDependencyEdge[] {
    return mapCreatedTasksToDependencies(template, createdTasks);
  }
}

export const taskGeneratorService = new TaskGeneratorService();
