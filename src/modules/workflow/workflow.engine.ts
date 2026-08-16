import {
  WorkflowHistoryAction,
  WorkflowInstanceStatus,
  WorkflowStepType,
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
import { resolveSkippedStepIds } from './step-skip-evaluator.js';
import { recordOrderEvent } from '../orders/order-events.service.js';
import { syncOrderStatusForOrder } from '../orders/order-status-sync.service.js';

export interface CreateWorkflowForOrderInput {
  orderId: string;
  productionOrderItemId: string;
  productOfferingVersionId: string;
  createdById?: string;
  metadata?: Prisma.InputJsonValue;
  orderSelections?: Record<string, string>;
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

    const selections = input.orderSelections ?? {};
    const skippedStepIds = resolveSkippedStepIds(
      template.steps.map((s) => ({ id: s.id, skipWhen: s.skipWhen })),
      selections,
    );

    const autoSkippedTaskIds: string[] = [];
    if (skippedStepIds.size > 0) {
      const now = new Date();
      for (const task of createdTasks) {
        if (skippedStepIds.has(task.workflowTemplateStepId)) {
          autoSkippedTaskIds.push(task.id);
          task.status = WorkflowTaskStatus.SKIPPED;
        }
      }
      if (autoSkippedTaskIds.length > 0) {
        await workflowRepository.updateTaskStatuses(
          autoSkippedTaskIds.map((id) => ({ id, status: WorkflowTaskStatus.SKIPPED, completedAt: now })),
          tx,
        );
      }
    }

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
        action: autoSkippedTaskIds.includes(task.id)
          ? WorkflowHistoryAction.SKIPPED
          : WorkflowHistoryAction.CREATED,
        performedById: input.createdById,
        remarks: autoSkippedTaskIds.includes(task.id)
          ? 'Auto-skipped: order configuration does not require this step'
          : undefined,
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
    }, { maxWait: 10_000, timeout: 30_000 });

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

      await this.blockDownstreamAndReworkTarget(tx, {
        workflowInstanceId: input.workflowInstanceId,
        sourceTaskId: qcTask.id,
        targetTaskId: targetTask.id,
        targetStepOrder: targetTask.stepOrder,
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
   * Uses updateMany (not per-task loops) to stay under transaction timeouts.
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
        where: {
          workflowInstanceId: instance.id,
          status: {
            notIn: [
              WorkflowTaskStatus.COMPLETED,
              WorkflowTaskStatus.CANCELLED,
              WorkflowTaskStatus.SKIPPED,
            ],
          },
        },
        select: { id: true },
      });

      const cancelledTaskIds = tasks.map((t) => t.id);

      if (cancelledTaskIds.length > 0) {
        await db.workflowTask.updateMany({
          where: { id: { in: cancelledTaskIds } },
          data: { status: WorkflowTaskStatus.CANCELLED, completedAt: now },
        });

        await db.workflowTaskHistory.createMany({
          data: cancelledTaskIds.map((taskId) => ({
            taskId,
            action: WorkflowHistoryAction.CANCELLED,
            remarks: input.reason,
            performedById: input.actorId,
          })),
        });

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
    return prisma.$transaction(run, { maxWait: 10_000, timeout: 30_000 });
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

  /**
   * Sends a workflow back to an earlier step: everything after the target is blocked, and the
   * target itself is put into REWORK so its department picks it up again.
   *
   * Shared by QC failure and vendor rejection so both kinds of "send it back" behave identically
   * — a second, subtly different implementation is exactly how a workflow ends up with two tasks
   * both believing they are current.
   */
  private async blockDownstreamAndReworkTarget(
    tx: Prisma.TransactionClient,
    args: {
      workflowInstanceId: string;
      sourceTaskId: string;
      targetTaskId: string;
      targetStepOrder: number;
    },
  ): Promise<void> {
    const downstreamTasks = await tx.workflowTask.findMany({
      where: {
        workflowInstanceId: args.workflowInstanceId,
        stepOrder: { gt: args.targetStepOrder },
        status: { notIn: [WorkflowTaskStatus.CANCELLED, WorkflowTaskStatus.SKIPPED] },
      },
      select: { id: true, status: true },
    });

    for (const downstream of downstreamTasks) {
      if (downstream.id === args.sourceTaskId) continue;
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
      where: { id: args.targetTaskId },
      data: { status: WorkflowTaskStatus.REWORK, completedAt: null },
    });
  }

  /**
   * Finds the open VENDOR_APPROVAL gate for an order's workflow, if one is waiting.
   *
   * VENDOR_APPROVAL tasks reach READY like any other task, but nothing on the production floor
   * can complete them — only the vendor's decision does. This is how the vendor portal discovers
   * "is there something waiting for me, and which gate is it".
   */
  async findOpenVendorApprovalTask(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    taskId: string;
    workflowInstanceId: string;
    stepCode: string;
    stepName: string;
    stepOrder: number;
  } | null> {
    const db = tx ?? prisma;
    const task = await db.workflowTask.findFirst({
      where: {
        workflowInstance: { orderId },
        workflowStep: { stepType: WorkflowStepType.VENDOR_APPROVAL },
        status: {
          in: [
            WorkflowTaskStatus.READY,
            WorkflowTaskStatus.PENDING,
            WorkflowTaskStatus.WAITING,
            WorkflowTaskStatus.ASSIGNED,
            WorkflowTaskStatus.IN_PROGRESS,
            WorkflowTaskStatus.REWORK,
          ],
        },
      },
      orderBy: { stepOrder: 'asc' },
      select: {
        id: true,
        workflowInstanceId: true,
        stepOrder: true,
        workflowStep: { select: { stepCode: true, stepName: true } },
      },
    });
    if (!task) return null;
    return {
      taskId: task.id,
      workflowInstanceId: task.workflowInstanceId,
      stepCode: task.workflowStep.stepCode,
      stepName: task.workflowStep.stepName,
      stepOrder: task.stepOrder,
    };
  }

  /**
   * The vendor rejected at an approval gate. The gate does NOT advance; the workflow is routed
   * back to whichever step can act on the feedback.
   *
   * Which step that is comes from the gate's own `metadata.reworkTargetStepCode` — so the digital
   * proof gate points at the design step, and the physical sample gate points at whatever the
   * client decides it should (design vs re-print). That makes the open question a template data
   * change rather than a code change once they answer.
   */
  async rejectVendorApproval(input: {
    workflowInstanceId: string;
    taskId: string;
    actorId: string;
    reason: string;
  }): Promise<{ targetTaskId: string; targetStepCode: string; reworkRequestId: string }> {
    return prisma.$transaction(async (tx) => {
      const gateTask = await tx.workflowTask.findFirst({
        where: { id: input.taskId, workflowInstanceId: input.workflowInstanceId },
        select: {
          id: true,
          status: true,
          stepOrder: true,
          workflowStep: {
            select: { stepCode: true, stepName: true, stepType: true, metadata: true },
          },
        },
      });
      if (!gateTask) throw ApiError.notFound('Approval task not found');
      if (gateTask.workflowStep.stepType !== WorkflowStepType.VENDOR_APPROVAL) {
        throw ApiError.badRequest('This workflow step is not a vendor approval gate');
      }

      const targetTaskId = await this.resolveReworkTargetTaskId(
        input.workflowInstanceId,
        gateTask.id,
        gateTask.stepOrder,
        gateTask.workflowStep.metadata,
        undefined,
        tx,
      );

      const targetTask = await tx.workflowTask.findUnique({
        where: { id: targetTaskId },
        select: { id: true, stepOrder: true, workflowStep: { select: { stepCode: true } } },
      });
      if (!targetTask) throw ApiError.notFound('Revision target task not found');

      await tx.workflowTask.update({
        where: { id: gateTask.id },
        data: { status: WorkflowTaskStatus.BLOCKED, remarks: input.reason },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: gateTask.id,
          action: WorkflowHistoryAction.REJECTED,
          remarks: input.reason,
          performedById: input.actorId,
        },
      });

      await this.blockDownstreamAndReworkTarget(tx, {
        workflowInstanceId: input.workflowInstanceId,
        sourceTaskId: gateTask.id,
        targetTaskId: targetTask.id,
        targetStepOrder: targetTask.stepOrder,
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: targetTask.id,
          action: WorkflowHistoryAction.REWORKED,
          remarks: input.reason,
          performedById: input.actorId,
        },
      });

      const reworkCycle =
        (await tx.reworkRequest.count({ where: { targetTaskId: targetTask.id } })) + 1;

      const reworkRequest = await tx.reworkRequest.create({
        data: {
          taskId: gateTask.id,
          targetTaskId: targetTask.id,
          status: ReworkStatus.OPEN,
          reason: `Customer requested changes at ${gateTask.workflowStep.stepName}`,
          notes: input.reason,
          reworkCycle,
          createdById: input.actorId,
        },
        select: { id: true },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.workflowReworked({
            workflowInstanceId: input.workflowInstanceId,
            taskId: targetTask.id,
            targetStepCode: targetTask.workflowStep.stepCode,
            actorId: input.actorId,
            remarks: input.reason,
          }),
        ],
        tx,
      );

      return {
        targetTaskId: targetTask.id,
        targetStepCode: targetTask.workflowStep.stepCode,
        reworkRequestId: reworkRequest.id,
      };
    });
  }

  /**
   * Under Review (Verification) staff flags an order as needing correction — bad artwork, missing
   * info, wrong file, etc. Unlike QC-rework/vendor-rejection, there is no earlier step to route
   * back to (Verification is step 1), so the task simply goes BLOCKED in place: it drops out of
   * the department queue and the order surfaces as IMPROPER_ORDER (via order-status-sync) until
   * resolveTaskCorrection() brings it back to READY.
   */
  async flagTaskForCorrection(input: {
    taskId: string;
    actorId: string;
    reason: string;
  }): Promise<{ taskId: string; workflowInstanceId: string; orderId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.workflowTask.findUnique({
        where: { id: input.taskId },
        select: {
          id: true,
          status: true,
          workflowInstanceId: true,
          workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
          workflowInstance: { select: { orderId: true } },
        },
      });
      if (!task) throw ApiError.notFound('Workflow task not found');
      if (task.workflowStep.stepType !== WorkflowStepType.VERIFICATION) {
        throw ApiError.badRequest('Only Under Review (Verification) tasks can be flagged for correction');
      }
      assertTaskTransition(task.status, WorkflowTaskStatus.BLOCKED);

      await tx.workflowTask.update({
        where: { id: task.id },
        data: { status: WorkflowTaskStatus.BLOCKED, remarks: input.reason },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: task.id,
          action: WorkflowHistoryAction.BLOCKED,
          remarks: input.reason,
          performedById: input.actorId,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.orderFlaggedImproper({
            workflowInstanceId: task.workflowInstanceId,
            taskId: task.id,
            stepName: task.workflowStep.stepName,
            reason: input.reason,
            actorId: input.actorId,
          }),
        ],
        tx,
      );

      await recordOrderEvent(
        task.workflowInstance.orderId,
        {
          eventType: 'ORDER_FLAGGED_IMPROPER',
          title: 'Order flagged for correction',
          description: input.reason,
          actorId: input.actorId,
        },
        tx,
      );

      return { taskId: task.id, workflowInstanceId: task.workflowInstanceId, orderId: task.workflowInstance.orderId };
    });

    await syncOrderStatusForOrder(result.orderId);
    return result;
  }

  /**
   * The flagged issue was fixed (vendor re-uploaded artwork, staff corrected the info, etc) —
   * brings the Verification task back to READY so it re-enters the department queue. Order status
   * naturally re-ranks to UNDER_ARTWORK_REVIEW on the next sync, exactly like any other active
   * Verification task; no separate "un-flag" write is needed.
   */
  async resolveTaskCorrection(input: {
    taskId: string;
    actorId: string;
    remarks?: string;
  }): Promise<{ taskId: string; workflowInstanceId: string; orderId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.workflowTask.findUnique({
        where: { id: input.taskId },
        select: {
          id: true,
          status: true,
          workflowInstanceId: true,
          workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
          workflowInstance: { select: { orderId: true } },
        },
      });
      if (!task) throw ApiError.notFound('Workflow task not found');
      if (task.status !== WorkflowTaskStatus.BLOCKED) {
        throw ApiError.conflict('Task is not currently flagged for correction');
      }
      assertTaskTransition(task.status, WorkflowTaskStatus.READY);

      await tx.workflowTask.update({
        where: { id: task.id },
        data: { status: WorkflowTaskStatus.READY, queuedAt: new Date(), remarks: null },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: task.id,
          action: WorkflowHistoryAction.UNBLOCKED,
          remarks: input.remarks,
          performedById: input.actorId,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          workflowTimelineService.orderCorrectionResolved({
            workflowInstanceId: task.workflowInstanceId,
            taskId: task.id,
            stepName: task.workflowStep.stepName,
            actorId: input.actorId,
            remarks: input.remarks,
          }),
        ],
        tx,
      );

      await recordOrderEvent(
        task.workflowInstance.orderId,
        {
          eventType: 'ORDER_CORRECTION_RESOLVED',
          title: 'Order correction resolved',
          description: input.remarks ?? 'Order resubmitted for review',
          actorId: input.actorId,
        },
        tx,
      );

      return { taskId: task.id, workflowInstanceId: task.workflowInstanceId, orderId: task.workflowInstance.orderId };
    });

    eventBus.emitEvent(APP_EVENTS.TASK_READY, {
      workflowInstanceId: result.workflowInstanceId,
      taskId: result.taskId,
    });
    await syncOrderStatusForOrder(result.orderId);
    return result;
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
