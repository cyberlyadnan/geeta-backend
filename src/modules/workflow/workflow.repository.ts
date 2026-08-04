import {
  Prisma,
  WorkflowInstanceStatus,
  WorkflowStatus,
  WorkflowTaskStatus,
  type WorkflowTimelineEntityType,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { DEFAULT_WORKFLOW_TEMPLATE_CODE } from './workflow.constants.js';

export const WORKFLOW_TEMPLATE_WITH_STEPS = {
  id: true,
  code: true,
  name: true,
  status: true,
  isDefault: true,
  steps: {
    orderBy: { stepOrder: 'asc' as const },
    select: {
      id: true,
      departmentId: true,
      stepName: true,
      stepCode: true,
      stepType: true,
      stepOrder: true,
      expectedMinutes: true,
      allowSkip: true,
      isMandatory: true,
      locksAmendmentsOnStart: true,
      instructions: true,
      metadata: true,
      dependencies: {
        select: {
          workflowTemplateStepId: true,
          dependsOnStepId: true,
          dependencyType: true,
        },
      },
    },
  },
} satisfies Prisma.WorkflowTemplateSelect;

export type WorkflowTemplateWithSteps = Prisma.WorkflowTemplateGetPayload<{
  select: typeof WORKFLOW_TEMPLATE_WITH_STEPS;
}>;

export const WORKFLOW_INSTANCE_DETAIL_SELECT = {
  id: true,
  orderId: true,
  productionOrderItemId: true,
  workflowTemplateId: true,
  templateVersion: true,
  status: true,
  currentStepOrder: true,
  startedAt: true,
  completedAt: true,
  createdById: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  workflowTemplate: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.WorkflowInstanceSelect;

export type WorkflowInstanceDetail = Prisma.WorkflowInstanceGetPayload<{
  select: typeof WORKFLOW_INSTANCE_DETAIL_SELECT;
}>;

export const WORKFLOW_TASK_LIST_SELECT = {
  id: true,
  workflowInstanceId: true,
  workflowTemplateStepId: true,
  departmentId: true,
  stepOrder: true,
  priority: true,
  estimatedMinutes: true,
  instructions: true,
  metadata: true,
  status: true,
  queuedAt: true,
  assignedAt: true,
  startedAt: true,
  completedAt: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, code: true, name: true } },
  workflowStep: { select: { id: true, stepCode: true, stepName: true, stepType: true } },
  dependencies: {
    select: {
      id: true,
      dependsOnTaskId: true,
      dependencyType: true,
    },
  },
} satisfies Prisma.WorkflowTaskSelect;

export type WorkflowTaskListItem = Prisma.WorkflowTaskGetPayload<{
  select: typeof WORKFLOW_TASK_LIST_SELECT;
}>;

export class WorkflowRepository {
  async resolveTemplateForProductVersion(
    productOfferingVersionId: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<WorkflowTemplateWithSteps> {
    const binding = await tx.productOfferingWorkflow.findUnique({
      where: { productOfferingVersionId },
      select: { workflowTemplateId: true },
    });

    const template = await tx.workflowTemplate.findFirst({
      where: binding
        ? { id: binding.workflowTemplateId, status: WorkflowStatus.ACTIVE }
        : { isDefault: true, status: WorkflowStatus.ACTIVE },
      select: WORKFLOW_TEMPLATE_WITH_STEPS,
    });

    if (!template) {
      throw ApiError.badRequest(
        `No active workflow template found for product version ${productOfferingVersionId}. ` +
          `Configure ProductOfferingWorkflow or set a default template (${DEFAULT_WORKFLOW_TEMPLATE_CODE}).`,
      );
    }

    if (template.steps.length === 0) {
      throw ApiError.badRequest(`Workflow template ${template.code} has no steps configured`);
    }

    return template;
  }

  async findInstanceById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowInstance.findUnique({
      where: { id },
      select: WORKFLOW_INSTANCE_DETAIL_SELECT,
    });
  }

  async findInstanceByOrderId(orderId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowInstance.findFirst({
      where: { orderId },
      select: WORKFLOW_INSTANCE_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInstanceByOrderItemId(productionOrderItemId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowInstance.findUnique({
      where: { productionOrderItemId },
      select: WORKFLOW_INSTANCE_DETAIL_SELECT,
    });
  }

  async listTasksByInstanceId(
    workflowInstanceId: string,
    options: { cursor?: string; limit?: number } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

    const tasks = await tx.workflowTask.findMany({
      where: { workflowInstanceId },
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ stepOrder: 'asc' }, { id: 'asc' }],
      select: WORKFLOW_TASK_LIST_SELECT,
    });

    const hasMore = tasks.length > limit;
    const items = hasMore ? tasks.slice(0, limit) : tasks;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor, hasMore };
  }

  async listTimelineEvents(
    workflowInstanceId: string,
    options: { cursor?: string; limit?: number } = {},
    tx: Prisma.TransactionClient = prisma,
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

    const events = await tx.workflowTimelineEvent.findMany({
      where: { workflowInstanceId },
      take: limit + 1,
      ...(options.cursor
        ? {
            cursor: { id: options.cursor },
            skip: 1,
          }
        : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        workflowInstanceId: true,
        entityType: true,
        entityId: true,
        eventType: true,
        title: true,
        description: true,
        metadata: true,
        actorId: true,
        createdAt: true,
      },
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor, hasMore };
  }

  async bulkCreateTimelineEvents(
    events: Array<{
      workflowInstanceId: string;
      entityType: WorkflowTimelineEntityType;
      entityId?: string;
      eventType: string;
      title: string;
      description?: string;
      metadata?: Prisma.InputJsonValue;
      actorId?: string;
    }>,
    tx: Prisma.TransactionClient,
  ) {
    if (events.length === 0) return { count: 0 };
    return tx.workflowTimelineEvent.createMany({ data: events });
  }

  async updateTaskStatuses(
    updates: Array<{ id: string; status: WorkflowTaskStatus; queuedAt?: Date }>,
    tx: Prisma.TransactionClient,
  ) {
    await Promise.all(
      updates.map((update) =>
        tx.workflowTask.update({
          where: { id: update.id },
          data: {
            status: update.status,
            ...(update.queuedAt ? { queuedAt: update.queuedAt } : {}),
          },
        }),
      ),
    );
  }

  async updateInstanceStatus(
    id: string,
    data: {
      status: WorkflowInstanceStatus;
      currentStepOrder?: number;
      startedAt?: Date | null;
      completedAt?: Date | null;
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.workflowInstance.update({
      where: { id },
      data,
      select: WORKFLOW_INSTANCE_DETAIL_SELECT,
    });
  }
}

export const workflowRepository = new WorkflowRepository();
