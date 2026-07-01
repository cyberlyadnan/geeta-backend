import type {
  WorkflowInstanceDetail,
  WorkflowTaskListItem,
} from './workflow.repository.js';

export interface WorkflowInstanceDto {
  id: string;
  orderId: string;
  productionOrderItemId: string;
  workflowTemplateId: string;
  templateVersion: number;
  status: string;
  currentStepOrder: number;
  startedAt: string | null;
  completedAt: string | null;
  createdById: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  template: {
    id: string;
    code: string;
    name: string;
  };
}

export interface WorkflowTaskDto {
  id: string;
  workflowInstanceId: string;
  workflowTemplateStepId: string;
  departmentId: string;
  stepOrder: number;
  priority: string;
  estimatedMinutes: number;
  instructions: string | null;
  metadata: unknown;
  status: string;
  queuedAt: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  department: { id: string; code: string; name: string };
  step: { id: string; stepCode: string; stepName: string; stepType: string };
  dependencies: Array<{ id: string; dependsOnTaskId: string; dependencyType: string }>;
}

export interface WorkflowTimelineEventDto {
  id: string;
  workflowInstanceId: string;
  entityType: string;
  entityId: string | null;
  eventType: string;
  title: string;
  description: string | null;
  metadata: unknown;
  actorId: string | null;
  createdAt: string;
}

export interface CursorPageMeta {
  nextCursor?: string;
  hasMore: boolean;
  limit: number;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function mapWorkflowInstanceToDto(instance: WorkflowInstanceDetail): WorkflowInstanceDto {
  return {
    id: instance.id,
    orderId: instance.orderId,
    productionOrderItemId: instance.productionOrderItemId,
    workflowTemplateId: instance.workflowTemplateId,
    templateVersion: instance.templateVersion,
    status: instance.status,
    currentStepOrder: instance.currentStepOrder,
    startedAt: toIso(instance.startedAt),
    completedAt: toIso(instance.completedAt),
    createdById: instance.createdById,
    metadata: instance.metadata,
    createdAt: instance.createdAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
    template: instance.workflowTemplate,
  };
}

export function mapWorkflowTaskToDto(task: WorkflowTaskListItem): WorkflowTaskDto {
  return {
    id: task.id,
    workflowInstanceId: task.workflowInstanceId,
    workflowTemplateStepId: task.workflowTemplateStepId,
    departmentId: task.departmentId,
    stepOrder: task.stepOrder,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    instructions: task.instructions,
    metadata: task.metadata,
    status: task.status,
    queuedAt: toIso(task.queuedAt),
    assignedAt: toIso(task.assignedAt),
    startedAt: toIso(task.startedAt),
    completedAt: toIso(task.completedAt),
    dueAt: toIso(task.dueAt),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    department: task.department,
    step: {
      id: task.workflowStep.id,
      stepCode: task.workflowStep.stepCode,
      stepName: task.workflowStep.stepName,
      stepType: task.workflowStep.stepType,
    },
    dependencies: task.dependencies,
  };
}

export function mapTimelineEventToDto(event: {
  id: string;
  workflowInstanceId: string;
  entityType: string;
  entityId: string | null;
  eventType: string;
  title: string;
  description: string | null;
  metadata: unknown;
  actorId: string | null;
  createdAt: Date;
}): WorkflowTimelineEventDto {
  return {
    id: event.id,
    workflowInstanceId: event.workflowInstanceId,
    entityType: event.entityType,
    entityId: event.entityId,
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    metadata: event.metadata,
    actorId: event.actorId,
    createdAt: event.createdAt.toISOString(),
  };
}
