import {
  WorkflowHistoryAction,
  WorkflowInstanceStatus,
  WorkflowTaskExecutionSessionStatus,
  WorkflowTaskStatus,
  ReworkStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { eventBus, APP_EVENTS } from '../../events/eventBus.js';
import { resolveReadyTaskIds, type TaskDependencyEdge } from './dependency-engine.js';
import { assertTaskTransition, isTaskTerminal } from './task-state-machine.js';
import {
  assertWorkflowInstanceTransition,
  isWorkflowTerminal,
} from './workflow-instance-state-machine.js';
import { taskGeneratorService } from './task-generator.service.js';
import { workflowTimelineService } from './workflow-timeline.service.js';
import { workflowRepository } from './workflow.repository.js';

export interface CreateWorkflowForOrderInput {
  orderId: string;
  productionOrderItemId: string;
  productOfferingVersionId: string;
  createdById?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface WorkflowCreationResult {
  workflowInstanceId: string;
  orderId: string;
  productionOrderItemId: string;
  templateCode: string;
  taskIds: string[];
  readyTaskIds: string[];
  status: WorkflowInstanceStatus;
}

export interface AdvanceWorkflowInput {
  workflowInstanceId: string;
  taskId: string;
  action: 'complete' | 'skip' | 'cancel';
  actorId?: string;
  remarks?: string;
}

export interface AdvanceWorkflowResult {
  workflowInstanceId: string;
  taskId: string;
  taskStatus: WorkflowTaskStatus;
  newlyReadyTaskIds: string[];
  workflowStatus: WorkflowInstanceStatus;
  workflowCompleted: boolean;
}

export type QcOutcomeResult =
  | 'PASS'
  | 'PASS_WITH_REMARKS'
  | 'FAIL'
  | 'ON_HOLD'
  | 'REWORK_REQUIRED';

export interface ProcessQcOutcomeInput {
  workflowInstanceId: string;
  qcTaskId: string;
  result: QcOutcomeResult;
  actorId?: string;
  remarks?: string;
  targetTaskId?: string;
}

export interface ProcessQcOutcomeResponse {
  workflowInstanceId: string;
  qcTaskId: string;
  qcTaskStatus: WorkflowTaskStatus;
  result: QcOutcomeResult;
  reworkTargetTaskId?: string;
  reworkRequestId?: string;
  advanceResult?: AdvanceWorkflowResult;
}

export class WorkflowEngine {
  async createForProductionOrder(
    input: CreateWorkflowForOrderInput,
    tx: Prisma.TransactionClient,
  ): Promise<WorkflowCreationResult> {
    const existing = await workflowRepository.findInstanceByOrderItemId(input.productionOrderItemId, tx);
    if (existing) {
      throw ApiError.conflict('Workflow instance already exists for this order item');
    }

    const template = await workflowRepository.resolveTemplateForProductVersion(
      input.productOfferingVersionId,
      tx,
    );

    const instance = await tx.workflowInstance.create({
      data: {
        orderId: input.orderId,
        productionOrderItemId: input.productionOrderItemId,
        workflowTemplateId: template.id,
        templateVersion: 1,
        status: WorkflowInstanceStatus.INITIALIZED,
        currentStepOrder: template.steps[0]?.stepOrder ?? 1,
        createdById: input.createdById,
        metadata: input.metadata ?? {},
      },
      select: { id: true, status: true },
    });

    const taskPayloads = taskGeneratorService.buildPayloads(instance.id, template);
    const createdTasks = await tx.workflowTask.createManyAndReturn({
      data: taskPayloads,
      select: { id: true, workflowTemplateStepId: true, stepOrder: true, status: true },
    });

    const taskDependencies = taskGeneratorService.resolveDependencies(template, createdTasks);

    if (taskDependencies.length > 0) {
      await tx.workflowTaskDependency.createMany({
        data: taskDependencies.map((dep) => ({
          taskId: dep.taskId,
          dependsOnTaskId: dep.dependsOnTaskId,
          dependencyType: dep.dependencyType,
        })),
      });
    }

    await tx.workflowTaskHistory.createMany({
      data: createdTasks.map((task) => ({
        taskId: task.id,
        action: WorkflowHistoryAction.CREATED,
        performedById: input.createdById,
      })),
    });

    const statusByTaskId = new Map(createdTasks.map((task) => [task.id, task.status]));
    const readyTaskIds = resolveReadyTaskIds(
      createdTasks.map((task) => ({ id: task.id, templateStepId: task.workflowTemplateStepId })),
      taskDependencies,
      statusByTaskId,
    );

    const now = new Date();
    const stepByTaskId = new Map(
      createdTasks.map((task) => {
        const step = template.steps.find((s) => s.id === task.workflowTemplateStepId);
        return [task.id, step];
      }),
    );

    if (readyTaskIds.length > 0) {
      await workflowRepository.updateTaskStatuses(
        readyTaskIds.map((id) => ({ id, status: WorkflowTaskStatus.READY, queuedAt: now })),
        tx,
      );

      for (const taskId of readyTaskIds) {
        statusByTaskId.set(taskId, WorkflowTaskStatus.READY);
      }
    }

    const timelineEvents = [
      workflowTimelineService.workflowCreated({
        workflowInstanceId: instance.id,
        templateCode: template.code,
        orderId: input.orderId,
        actorId: input.createdById,
      }),
      workflowTimelineService.tasksGenerated({
        workflowInstanceId: instance.id,
        taskCount: createdTasks.length,
        actorId: input.createdById,
      }),
      ...readyTaskIds.flatMap((taskId) => {
        const step = stepByTaskId.get(taskId);
        if (!step) return [];
        return [
          workflowTimelineService.taskReady({
            workflowInstanceId: instance.id,
            taskId,
            stepCode: step.stepCode,
            stepName: step.stepName,
            actorId: input.createdById,
          }),
          workflowTimelineService.taskActivated({
            workflowInstanceId: instance.id,
            taskId,
            stepCode: step.stepCode,
            actorId: input.createdById,
          }),
        ];
      }),
    ];

    await workflowTimelineService.recordEvents(timelineEvents, tx);

    let finalStatus = instance.status;

    if (readyTaskIds.length > 0) {
      assertWorkflowInstanceTransition(finalStatus, WorkflowInstanceStatus.RUNNING);
      const firstReadyOrder = Math.min(
        ...readyTaskIds.map((id) => createdTasks.find((t) => t.id === id)?.stepOrder ?? Number.MAX_SAFE_INTEGER),
      );

      await workflowRepository.updateInstanceStatus(
        instance.id,
        {
          status: WorkflowInstanceStatus.RUNNING,
          currentStepOrder: firstReadyOrder,
          startedAt: now,
        },
        tx,
      );

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.statusChanged({
            workflowInstanceId: instance.id,
            from: finalStatus,
            to: WorkflowInstanceStatus.RUNNING,
            actorId: input.createdById,
          }),
        ],
        tx,
      );

      finalStatus = WorkflowInstanceStatus.RUNNING;
    }

    return {
      workflowInstanceId: instance.id,
      orderId: input.orderId,
      productionOrderItemId: input.productionOrderItemId,
      templateCode: template.code,
      taskIds: createdTasks.map((task) => task.id),
      readyTaskIds,
      status: finalStatus,
    };
  }

  publishCreationEvents(result: WorkflowCreationResult): void {
    eventBus.emitEvent(APP_EVENTS.WORKFLOW_CREATED, {
      workflowInstanceId: result.workflowInstanceId,
      orderId: result.orderId,
      productionOrderItemId: result.productionOrderItemId,
      templateCode: result.templateCode,
      status: result.status,
    });

    eventBus.emitEvent(APP_EVENTS.TASK_CREATED, {
      workflowInstanceId: result.workflowInstanceId,
      taskIds: result.taskIds,
      count: result.taskIds.length,
    });

    for (const taskId of result.readyTaskIds) {
      eventBus.emitEvent(APP_EVENTS.TASK_READY, {
        workflowInstanceId: result.workflowInstanceId,
        taskId,
      });
    }
  }

  async advance(input: AdvanceWorkflowInput): Promise<AdvanceWorkflowResult> {
    const targetStatus = this.resolveAdvanceTargetStatus(input.action);

    const result = await prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.findUnique({
        where: { id: input.workflowInstanceId },
        select: { id: true, status: true },
      });

      if (!instance) throw ApiError.notFound('Workflow instance not found');
      if (isWorkflowTerminal(instance.status)) {
        throw ApiError.conflict(`Workflow is in terminal state ${instance.status}`);
      }

      const task = await tx.workflowTask.findFirst({
        where: { id: input.taskId, workflowInstanceId: input.workflowInstanceId },
        select: {
          id: true,
          status: true,
          stepOrder: true,
          workflowStep: { select: { stepCode: true, stepName: true, isMandatory: true } },
        },
      });

      if (!task) throw ApiError.notFound('Workflow task not found');
      assertTaskTransition(task.status, targetStatus);

      const now = new Date();
      await tx.workflowTask.update({
        where: { id: task.id },
        data: {
          status: targetStatus,
          ...(targetStatus === WorkflowTaskStatus.COMPLETED ||
          targetStatus === WorkflowTaskStatus.SKIPPED ||
          targetStatus === WorkflowTaskStatus.CANCELLED
            ? { completedAt: now }
            : {}),
          ...(input.remarks ? { remarks: input.remarks } : {}),
        },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: task.id,
          action:
            targetStatus === WorkflowTaskStatus.COMPLETED
              ? WorkflowHistoryAction.COMPLETED
              : targetStatus === WorkflowTaskStatus.SKIPPED
                ? WorkflowHistoryAction.SKIPPED
                : WorkflowHistoryAction.CANCELLED,
          remarks: input.remarks,
          performedById: input.actorId,
        },
      });

      const timelineEvents = [];

      if (targetStatus === WorkflowTaskStatus.COMPLETED) {
        timelineEvents.push(
          workflowTimelineService.taskCompleted({
            workflowInstanceId: instance.id,
            taskId: task.id,
            stepCode: task.workflowStep.stepCode,
            actorId: input.actorId,
          }),
        );
      }

      const [allTasks, allDependencies] = await Promise.all([
        tx.workflowTask.findMany({
          where: { workflowInstanceId: instance.id },
          select: {
            id: true,
            status: true,
            workflowTemplateStepId: true,
            stepOrder: true,
            workflowStep: { select: { stepCode: true, stepName: true, isMandatory: true } },
          },
        }),
        tx.workflowTaskDependency.findMany({
          where: { task: { workflowInstanceId: instance.id } },
          select: { taskId: true, dependsOnTaskId: true, dependencyType: true },
        }),
      ]);

      const statusByTaskId = new Map(allTasks.map((t) => [t.id, t.status]));
      statusByTaskId.set(task.id, targetStatus);

      const newlyReadyTaskIds = resolveReadyTaskIds(
        allTasks.map((t) => ({ id: t.id, templateStepId: t.workflowTemplateStepId })),
        allDependencies as TaskDependencyEdge[],
        statusByTaskId,
      );

      if (newlyReadyTaskIds.length > 0) {
        await workflowRepository.updateTaskStatuses(
          newlyReadyTaskIds.map((id) => ({ id, status: WorkflowTaskStatus.READY, queuedAt: now })),
          tx,
        );

        for (const readyId of newlyReadyTaskIds) {
          const readyTask = allTasks.find((t) => t.id === readyId);
          if (!readyTask) continue;
          timelineEvents.push(
            workflowTimelineService.taskReady({
              workflowInstanceId: instance.id,
              taskId: readyId,
              stepCode: readyTask.workflowStep.stepCode,
              stepName: readyTask.workflowStep.stepName,
              actorId: input.actorId,
            }),
            workflowTimelineService.taskActivated({
              workflowInstanceId: instance.id,
              taskId: readyId,
              stepCode: readyTask.workflowStep.stepCode,
              actorId: input.actorId,
            }),
          );
        }
      }

      const isTaskTerminalForCompletion = (
        taskRow: (typeof allTasks)[number],
        status: WorkflowTaskStatus,
      ) => {
        if (status === WorkflowTaskStatus.COMPLETED || status === WorkflowTaskStatus.SKIPPED) {
          return true;
        }
        if (status === WorkflowTaskStatus.CANCELLED && !taskRow.workflowStep.isMandatory) {
          return true;
        }
        return false;
      };

      const allComplete = allTasks.every((t) => {
        const status = t.id === task.id ? targetStatus : t.status;
        return isTaskTerminalForCompletion(t, status);
      });

      let workflowStatus = instance.status;
      let workflowCompleted = false;

      if (allComplete) {
        assertWorkflowInstanceTransition(workflowStatus, WorkflowInstanceStatus.COMPLETED);
        await workflowRepository.updateInstanceStatus(
          instance.id,
          { status: WorkflowInstanceStatus.COMPLETED, completedAt: now },
          tx,
        );
        timelineEvents.push(
          workflowTimelineService.workflowCompleted({
            workflowInstanceId: instance.id,
            actorId: input.actorId,
          }),
        );
        workflowStatus = WorkflowInstanceStatus.COMPLETED;
        workflowCompleted = true;
      } else if (instance.status === WorkflowInstanceStatus.INITIALIZED && newlyReadyTaskIds.length > 0) {
        assertWorkflowInstanceTransition(workflowStatus, WorkflowInstanceStatus.RUNNING);
        await workflowRepository.updateInstanceStatus(
          instance.id,
          { status: WorkflowInstanceStatus.RUNNING, startedAt: now },
          tx,
        );
        workflowStatus = WorkflowInstanceStatus.RUNNING;
      }

      if (timelineEvents.length > 0) {
        await workflowTimelineService.recordEvents(timelineEvents, tx);
      }

      return {
        workflowInstanceId: instance.id,
        taskId: task.id,
        taskStatus: targetStatus,
        newlyReadyTaskIds,
        workflowStatus,
        workflowCompleted,
      };
    });

    for (const readyId of result.newlyReadyTaskIds) {
      eventBus.emitEvent(APP_EVENTS.TASK_READY, {
        workflowInstanceId: result.workflowInstanceId,
        taskId: readyId,
      });
    }

    if (result.taskStatus === WorkflowTaskStatus.COMPLETED) {
      eventBus.emitEvent(APP_EVENTS.TASK_COMPLETED, {
        workflowInstanceId: result.workflowInstanceId,
        taskId: result.taskId,
      });
    }

    if (result.workflowCompleted) {
      eventBus.emitEvent(APP_EVENTS.WORKFLOW_COMPLETED, {
        workflowInstanceId: result.workflowInstanceId,
      });
    }

    return result;
  }

  /**
   * QC Engine entry point — records outcome and delegates workflow progression.
   * Never activates downstream tasks directly except via advance() on pass.
   */
  async processQcOutcome(input: ProcessQcOutcomeInput): Promise<ProcessQcOutcomeResponse> {
    if (input.result === 'PASS' || input.result === 'PASS_WITH_REMARKS') {
      const advanceResult = await this.advance({
        workflowInstanceId: input.workflowInstanceId,
        taskId: input.qcTaskId,
        action: 'complete',
        actorId: input.actorId,
        remarks: input.remarks,
      });
      return {
        workflowInstanceId: input.workflowInstanceId,
        qcTaskId: input.qcTaskId,
        qcTaskStatus: advanceResult.taskStatus,
        result: input.result,
        advanceResult,
      };
    }

    if (input.result === 'ON_HOLD') {
      const qcTaskStatus = await this.applyQcHold(input);
      return {
        workflowInstanceId: input.workflowInstanceId,
        qcTaskId: input.qcTaskId,
        qcTaskStatus,
        result: input.result,
      };
    }

    const rework = await this.applyQcRework(input);
    return {
      workflowInstanceId: input.workflowInstanceId,
      qcTaskId: input.qcTaskId,
      qcTaskStatus: rework.qcTaskStatus,
      result: input.result,
      reworkTargetTaskId: rework.targetTaskId,
      reworkRequestId: rework.reworkRequestId,
    };
  }

  private async applyQcHold(input: ProcessQcOutcomeInput): Promise<WorkflowTaskStatus> {
    return prisma.$transaction(async (tx) => {
      const task = await tx.workflowTask.findFirst({
        where: { id: input.qcTaskId, workflowInstanceId: input.workflowInstanceId },
        select: {
          id: true,
          status: true,
          workflowStep: { select: { stepCode: true, stepName: true } },
        },
      });
      if (!task) throw ApiError.notFound('QC workflow task not found');
      assertTaskTransition(task.status, WorkflowTaskStatus.ON_HOLD);

      await tx.workflowTask.update({
        where: { id: task.id },
        data: { status: WorkflowTaskStatus.ON_HOLD, ...(input.remarks ? { remarks: input.remarks } : {}) },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: task.id,
          action: WorkflowHistoryAction.ON_HOLD,
          remarks: input.remarks,
          performedById: input.actorId,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.qcHeld({
            workflowInstanceId: input.workflowInstanceId,
            taskId: task.id,
            stepName: task.workflowStep.stepName,
            actorId: input.actorId,
            remarks: input.remarks,
          }),
        ],
        tx,
      );

      return WorkflowTaskStatus.ON_HOLD;
    });
  }

  private async applyQcRework(input: ProcessQcOutcomeInput): Promise<{
    qcTaskStatus: WorkflowTaskStatus;
    targetTaskId: string;
    reworkRequestId: string;
  }> {
    return prisma.$transaction(async (tx) => {
      const qcTask = await tx.workflowTask.findFirst({
        where: { id: input.qcTaskId, workflowInstanceId: input.workflowInstanceId },
        select: {
          id: true,
          status: true,
          stepOrder: true,
          workflowStep: {
            select: { stepCode: true, stepName: true, allowRework: true, metadata: true },
          },
        },
      });
      if (!qcTask) throw ApiError.notFound('QC workflow task not found');
      if (!qcTask.workflowStep.allowRework) {
        throw ApiError.conflict('Rework is not allowed for this workflow step');
      }

      const targetTaskId = await this.resolveReworkTargetTaskId(
        input.workflowInstanceId,
        qcTask.id,
        qcTask.stepOrder,
        qcTask.workflowStep.metadata,
        input.targetTaskId,
        tx,
      );

      const targetTask = await tx.workflowTask.findUnique({
        where: { id: targetTaskId },
        select: { id: true, status: true, stepOrder: true, workflowStep: { select: { stepCode: true } } },
      });
      if (!targetTask) throw ApiError.notFound('Rework target task not found');

      assertTaskTransition(qcTask.status, WorkflowTaskStatus.BLOCKED);

      await tx.workflowTask.update({
        where: { id: qcTask.id },
        data: { status: WorkflowTaskStatus.BLOCKED, ...(input.remarks ? { remarks: input.remarks } : {}) },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: qcTask.id,
          action: WorkflowHistoryAction.REJECTED,
          remarks: input.remarks,
          performedById: input.actorId,
        },
      });

      const downstreamTasks = await tx.workflowTask.findMany({
        where: {
          workflowInstanceId: input.workflowInstanceId,
          stepOrder: { gt: targetTask.stepOrder },
          status: {
            notIn: [
              WorkflowTaskStatus.CANCELLED,
              WorkflowTaskStatus.SKIPPED,
            ],
          },
        },
        select: { id: true, status: true },
      });

      for (const downstream of downstreamTasks) {
        if (downstream.id === qcTask.id) continue;
        if (isTaskTerminal(downstream.status)) {
          await tx.workflowTask.update({
            where: { id: downstream.id },
            data: { status: WorkflowTaskStatus.BLOCKED, completedAt: null },
          });
          continue;
        }
        if (downstream.status !== WorkflowTaskStatus.BLOCKED) {
          await tx.workflowTask.update({
            where: { id: downstream.id },
            data: { status: WorkflowTaskStatus.BLOCKED },
          });
        }
      }

      await tx.workflowTask.update({
        where: { id: targetTask.id },
        data: {
          status: WorkflowTaskStatus.REWORK,
          completedAt: null,
        },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: targetTask.id,
          action: WorkflowHistoryAction.REWORKED,
          remarks: input.remarks,
          performedById: input.actorId,
        },
      });

      const reworkCycle =
        (await tx.reworkRequest.count({ where: { targetTaskId: targetTask.id } })) + 1;

      const reworkRequest = await tx.reworkRequest.create({
        data: {
          taskId: qcTask.id,
          targetTaskId: targetTask.id,
          status: ReworkStatus.OPEN,
          reason: input.result === 'FAIL' ? 'QC inspection failed' : 'QC rework required',
          notes: input.remarks,
          reworkCycle,
          createdById: input.actorId,
        },
        select: { id: true },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.qcFailed({
            workflowInstanceId: input.workflowInstanceId,
            taskId: qcTask.id,
            stepName: qcTask.workflowStep.stepName,
            actorId: input.actorId,
            remarks: input.remarks,
          }),
          workflowTimelineService.workflowReworked({
            workflowInstanceId: input.workflowInstanceId,
            taskId: targetTask.id,
            targetStepCode: targetTask.workflowStep.stepCode,
            actorId: input.actorId,
            remarks: input.remarks,
          }),
        ],
        tx,
      );

      return {
        qcTaskStatus: WorkflowTaskStatus.BLOCKED,
        targetTaskId: targetTask.id,
        reworkRequestId: reworkRequest.id,
      };
    });
  }

  /**
   * Bulk-cancel a workflow instance and all non-terminal tasks.
   * Closes active execution sessions. Used by Order Cancellation Engine.
   */
  async cancelInstance(
    input: {
      workflowInstanceId: string;
      actorId?: string;
      reason?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ workflowInstanceId: string; cancelledTaskIds: string[] }> {
    const run = async (db: Prisma.TransactionClient) => {
      const instance = await db.workflowInstance.findUnique({
        where: { id: input.workflowInstanceId },
        select: { id: true, status: true, orderId: true },
      });

      if (!instance) throw ApiError.notFound('Workflow instance not found');
      if (isWorkflowTerminal(instance.status)) {
        return { workflowInstanceId: instance.id, cancelledTaskIds: [] };
      }

      assertWorkflowInstanceTransition(instance.status, WorkflowInstanceStatus.CANCELLED);

      const now = new Date();
      const tasks = await db.workflowTask.findMany({
        where: { workflowInstanceId: instance.id },
        select: { id: true, status: true },
      });

      const cancellable = tasks.filter((t) => !isTaskTerminal(t.status));
      const cancelledTaskIds: string[] = [];

      for (const task of cancellable) {
        assertTaskTransition(task.status, WorkflowTaskStatus.CANCELLED);
        await db.workflowTask.update({
          where: { id: task.id },
          data: { status: WorkflowTaskStatus.CANCELLED, completedAt: now },
        });
        await db.workflowTaskHistory.create({
          data: {
            taskId: task.id,
            action: WorkflowHistoryAction.CANCELLED,
            remarks: input.reason,
            performedById: input.actorId,
          },
        });
        cancelledTaskIds.push(task.id);
      }

      if (cancelledTaskIds.length > 0) {
        await db.workflowTaskExecutionSession.updateMany({
          where: {
            workflowTaskId: { in: cancelledTaskIds },
            status: {
              in: [
                WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
                WorkflowTaskExecutionSessionStatus.PAUSED,
                WorkflowTaskExecutionSessionStatus.ON_HOLD,
              ],
            },
          },
          data: {
            status: WorkflowTaskExecutionSessionStatus.COMPLETED,
            completedAt: now,
          },
        });
      }

      await db.workflowInstance.update({
        where: { id: instance.id },
        data: { status: WorkflowInstanceStatus.CANCELLED, completedAt: now },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.workflowCancelled({
            workflowInstanceId: instance.id,
            reason: input.reason,
            actorId: input.actorId,
          }),
          workflowTimelineService.statusChanged({
            workflowInstanceId: instance.id,
            from: instance.status,
            to: WorkflowInstanceStatus.CANCELLED,
            actorId: input.actorId,
          }),
        ],
        db,
      );

      return { workflowInstanceId: instance.id, cancelledTaskIds };
    };

    if (tx) return run(tx);
    return prisma.$transaction(run);
  }

  publishCancellationEvents(input: {
    workflowInstanceId: string;
    orderId: string;
    cancelledTaskIds: string[];
    actorId?: string;
  }): void {
    eventBus.emitEvent(APP_EVENTS.WORKFLOW_CANCELLED, {
      workflowInstanceId: input.workflowInstanceId,
      orderId: input.orderId,
      cancelledTaskIds: input.cancelledTaskIds,
      actorId: input.actorId,
    });
  }

  private async resolveReworkTargetTaskId(
    workflowInstanceId: string,
    qcTaskId: string,
    qcStepOrder: number,
    stepMetadata: unknown,
    explicitTargetTaskId: string | undefined,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    if (explicitTargetTaskId) return explicitTargetTaskId;

    const metadata = (stepMetadata ?? {}) as { reworkTargetStepCode?: string };
    if (metadata.reworkTargetStepCode) {
      const match = await tx.workflowTask.findFirst({
        where: {
          workflowInstanceId,
          workflowStep: { stepCode: metadata.reworkTargetStepCode },
        },
        select: { id: true },
      });
      if (match) return match.id;
    }

    const completedPredecessor = await tx.workflowTask.findFirst({
      where: {
        workflowInstanceId,
        stepOrder: { lt: qcStepOrder },
        status: WorkflowTaskStatus.COMPLETED,
      },
      orderBy: { stepOrder: 'desc' },
      select: { id: true },
    });
    if (completedPredecessor) return completedPredecessor.id;

    const predecessor = await tx.workflowTask.findFirst({
      where: {
        workflowInstanceId,
        stepOrder: { lt: qcStepOrder },
        id: { not: qcTaskId },
      },
      orderBy: { stepOrder: 'desc' },
      select: { id: true },
    });

    if (!predecessor) {
      throw ApiError.conflict('Unable to resolve rework target task from workflow template');
    }

    return predecessor.id;
  }

  private resolveAdvanceTargetStatus(action: AdvanceWorkflowInput['action']): WorkflowTaskStatus {
    switch (action) {
      case 'complete':
        return WorkflowTaskStatus.COMPLETED;
      case 'skip':
        return WorkflowTaskStatus.SKIPPED;
      case 'cancel':
        return WorkflowTaskStatus.CANCELLED;
      default:
        throw ApiError.badRequest('Invalid advance action');
    }
  }
}

export const workflowEngine = new WorkflowEngine();
