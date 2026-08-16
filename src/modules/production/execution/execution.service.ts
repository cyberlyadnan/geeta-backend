import {
  ActivityAction,
  ProductionExecutionAlertType,
  WorkflowHistoryAction,
  WorkflowStepType,
  WorkflowTaskExecutionIntervalType,
  WorkflowTaskExecutionSessionStatus,
  WorkflowTaskStatus,
  type Prisma,
  type RoleName,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { eventBus, APP_EVENTS } from '../../../events/eventBus.js';
import { activityLogService } from '../../../services/activity/activity-log.service.js';
import { storageService } from '../../../services/storage/storage.service.js';
import { resolveExtension, sanitizeFileName } from '../../../services/storage/storage.utils.js';
import { assertTaskTransition, isTaskTerminal } from '../../workflow/task-state-machine.js';
import { workflowEngine } from '../../workflow/workflow.engine.js';
import { workflowTimelineService } from '../../workflow/workflow-timeline.service.js';
import { productionQueueCache } from '../queue/queue.cache.js';
import { machineService } from '../machines/machine.service.js';
import { recordOrderEvent } from '../../orders/order-events.service.js';
import { assertCanExecuteTask, assertCanViewDepartmentExecution, canExecuteTasks } from './execution.access.js';
import {
  mapAttachmentToDto,
  mapDepartmentExecutionItem,
  mapExecutionSessionToDto,
  mapNoteToDto,
} from './execution.dto.js';
import {
  assertSessionTransition,
  assertTaskStatusForComplete,
  assertTaskStatusForHold,
  assertTaskStatusForPause,
  assertTaskStatusForResume,
  taskStatusForSessionStart,
} from './execution-state-machine.js';
import { executionRepository } from './execution.repository.js';
import type {
  AddNoteBody,
  AlertBody,
  DepartmentExecutionQuery,
  ExecutionActionBody,
  HoldTaskBody,
  PresignAttachmentBody,
  RegisterAttachmentBody,
} from './execution.validation.js';
import {
  accumulateDuration,
  computeTotalDuration,
  durationSeconds,
} from './time-tracking.util.js';
import { logger } from '../../../logs/logger.js';
import type { TimelineEventInput } from '../../workflow/workflow-timeline.service.js';

const EXECUTION_TX_OPTIONS = {
  maxWait: 10000,
  timeout: 20000,
} as const;

type SessionTotals = {
  workingDurationSeconds: number;
  pausedDurationSeconds: number;
  holdDurationSeconds: number;
};

export class ExecutionService {
  async startTask(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: ExecutionActionBody = {},
  ) {
    const task = await executionRepository.findTaskForExecution(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    this.assertNotQcExecutionTask(task.workflowStep.stepType);
    if (isTaskTerminal(task.status)) {
      throw ApiError.conflict(`Cannot start task in terminal state ${task.status}`);
    }

    const assignment = await executionRepository.findActiveAssignment(taskId);
    if (!assignment) throw ApiError.conflict('Task must be assigned before starting');
    assertCanExecuteTask(assignment.operatorId, actorId, role, permissions);

    const existingSession = await executionRepository.findActiveSession(taskId);
    if (existingSession) throw ApiError.conflict('Task already has an active execution session');

    const targetStatus = taskStatusForSessionStart(task.status);
    assertTaskTransition(task.status, targetStatus);

    const now = new Date();

    const session = await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({
        where: { id: taskId },
        data: { status: targetStatus, startedAt: task.startedAt ?? now },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId,
          action: WorkflowHistoryAction.STARTED,
          remarks: body.remarks,
          performedById: actorId,
        },
      });

      const created = await tx.workflowTaskExecutionSession.create({
        data: {
          workflowTaskId: taskId,
          assignmentId: assignment.id,
          operatorId: assignment.operatorId,
          departmentId: assignment.departmentId,
          status: WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
          startedAt: now,
          activeIntervalStartedAt: now,
          activeIntervalType: WorkflowTaskExecutionIntervalType.WORKING,
        },
        select: { id: true },
      });

      await tx.workflowTaskExecutionInterval.create({
        data: {
          sessionId: created.id,
          intervalType: WorkflowTaskExecutionIntervalType.WORKING,
          startedAt: now,
        },
      });

      return created;
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskStarted({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        stepName: task.workflowStep.stepName,
        actorId,
      }),
    ]);

    this.afterExecutionMutation(ActivityAction.TASK_STARTED, APP_EVENTS.TASK_STARTED, {
      taskId,
      sessionId: session.id,
      operatorId: assignment.operatorId,
      actorId,
    });

    const record = await executionRepository.findSessionById(session.id);
    if (!record) throw ApiError.internal('Failed to load execution session');
    return mapExecutionSessionToDto(record);
  }

  async pauseTask(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: ExecutionActionBody = {},
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);
    assertTaskStatusForPause(task.status);
    assertSessionTransition(session.status, WorkflowTaskExecutionSessionStatus.PAUSED);
    assertTaskTransition(task.status, WorkflowTaskStatus.PAUSED);

    const now = new Date();
    const totals = await this.closeActiveInterval(session, now);

    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({ where: { id: taskId }, data: { status: WorkflowTaskStatus.PAUSED } });
      await tx.workflowTaskHistory.create({
        data: {
          taskId,
          action: WorkflowHistoryAction.PAUSED,
          remarks: body.remarks,
          performedById: actorId,
        },
      });
      await tx.workflowTaskExecutionSession.update({
        where: { id: session.id },
        data: {
          status: WorkflowTaskExecutionSessionStatus.PAUSED,
          pausedAt: now,
          ...totals,
          activeIntervalStartedAt: now,
          activeIntervalType: WorkflowTaskExecutionIntervalType.PAUSED,
        },
      });
      await tx.workflowTaskExecutionInterval.create({
        data: {
          sessionId: session.id,
          intervalType: WorkflowTaskExecutionIntervalType.PAUSED,
          startedAt: now,
        },
      });
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskPaused({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        actorId,
        remarks: body.remarks,
      }),
    ]);

    this.afterExecutionMutation(ActivityAction.TASK_PAUSED, APP_EVENTS.TASK_PAUSED, {
      taskId,
      sessionId: session.id,
      actorId,
    });

    return this.getExecution(taskId);
  }

  async resumeTask(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: ExecutionActionBody = {},
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);
    assertTaskStatusForResume(task.status);

    if (task.status === WorkflowTaskStatus.ON_HOLD) {
      throw ApiError.conflict('Task is on hold. Release hold before resuming.');
    }

    assertSessionTransition(session.status, WorkflowTaskExecutionSessionStatus.IN_PROGRESS);
    assertTaskTransition(task.status, WorkflowTaskStatus.IN_PROGRESS);

    const now = new Date();
    const totals = await this.closeActiveInterval(session, now);

    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({ where: { id: taskId }, data: { status: WorkflowTaskStatus.IN_PROGRESS } });
      await tx.workflowTaskHistory.create({
        data: {
          taskId,
          action: WorkflowHistoryAction.RESUMED,
          remarks: body.remarks,
          performedById: actorId,
        },
      });
      await tx.workflowTaskExecutionSession.update({
        where: { id: session.id },
        data: {
          status: WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
          resumedAt: now,
          ...totals,
          activeIntervalStartedAt: now,
          activeIntervalType: WorkflowTaskExecutionIntervalType.WORKING,
        },
      });
      await tx.workflowTaskExecutionInterval.create({
        data: {
          sessionId: session.id,
          intervalType: WorkflowTaskExecutionIntervalType.WORKING,
          startedAt: now,
        },
      });
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskResumed({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        actorId,
      }),
    ]);

    this.afterExecutionMutation(ActivityAction.TASK_RESUMED, APP_EVENTS.TASK_RESUMED, {
      taskId,
      sessionId: session.id,
      actorId,
    });

    return this.getExecution(taskId);
  }

  async holdTask(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: HoldTaskBody,
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);
    assertTaskStatusForHold(task.status);
    assertSessionTransition(session.status, WorkflowTaskExecutionSessionStatus.ON_HOLD);
    assertTaskTransition(task.status, WorkflowTaskStatus.ON_HOLD);

    const openHold = await executionRepository.findOpenHold(session.id);
    if (openHold) throw ApiError.conflict('Task already has an active hold');

    const now = new Date();
    const totals = await this.closeActiveInterval(session, now);

    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({ where: { id: taskId }, data: { status: WorkflowTaskStatus.ON_HOLD } });
      await tx.workflowTaskHistory.create({
        data: {
          taskId,
          action: WorkflowHistoryAction.ON_HOLD,
          remarks: body.notes,
          performedById: actorId,
        },
      });
      await tx.workflowTaskExecutionSession.update({
        where: { id: session.id },
        data: {
          status: WorkflowTaskExecutionSessionStatus.ON_HOLD,
          ...totals,
          activeIntervalStartedAt: now,
          activeIntervalType: WorkflowTaskExecutionIntervalType.HOLD,
        },
      });
      await tx.workflowTaskExecutionInterval.create({
        data: {
          sessionId: session.id,
          intervalType: WorkflowTaskExecutionIntervalType.HOLD,
          startedAt: now,
        },
      });
      await tx.workflowTaskHold.create({
        data: {
          sessionId: session.id,
          workflowTaskId: taskId,
          reason: body.reason,
          notes: body.notes,
          createdById: actorId,
        },
      });
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskHeld({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        reason: body.reason,
        actorId,
        notes: body.notes,
      }),
    ]);

    this.afterExecutionMutation(ActivityAction.TASK_HELD, APP_EVENTS.TASK_HELD, {
      taskId,
      sessionId: session.id,
      actorId,
      reason: body.reason,
    });

    return this.getExecution(taskId);
  }

  async releaseHold(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: ExecutionActionBody = {},
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);
    if (task.status !== WorkflowTaskStatus.ON_HOLD) {
      throw ApiError.conflict(`Task must be ON_HOLD to release (current: ${task.status})`);
    }

    const openHold = await executionRepository.findOpenHold(session.id);
    if (!openHold) throw ApiError.conflict('No active hold found on this task');

    assertSessionTransition(session.status, WorkflowTaskExecutionSessionStatus.IN_PROGRESS);
    assertTaskTransition(task.status, WorkflowTaskStatus.IN_PROGRESS);

    const now = new Date();
    const totals = await this.closeActiveInterval(session, now);

    await prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({ where: { id: taskId }, data: { status: WorkflowTaskStatus.IN_PROGRESS } });
      await tx.workflowTaskHistory.create({
        data: {
          taskId,
          action: WorkflowHistoryAction.RESUMED,
          remarks: body.remarks ?? 'Hold released',
          performedById: actorId,
        },
      });
      await tx.workflowTaskHold.update({
        where: { id: openHold.id },
        data: { releasedAt: now },
      });
      await tx.workflowTaskExecutionSession.update({
        where: { id: session.id },
        data: {
          status: WorkflowTaskExecutionSessionStatus.IN_PROGRESS,
          resumedAt: now,
          ...totals,
          activeIntervalStartedAt: now,
          activeIntervalType: WorkflowTaskExecutionIntervalType.WORKING,
        },
      });
      await tx.workflowTaskExecutionInterval.create({
        data: {
          sessionId: session.id,
          intervalType: WorkflowTaskExecutionIntervalType.WORKING,
          startedAt: now,
        },
      });
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskResumed({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        actorId,
      }),
    ]);

    this.afterExecutionMutation(ActivityAction.TASK_RESUMED, APP_EVENTS.TASK_RESUMED, {
      taskId,
      sessionId: session.id,
      actorId,
      holdReleased: true,
    });

    return this.getExecution(taskId);
  }

  async completeTask(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: ExecutionActionBody = {},
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);
    assertTaskStatusForComplete(task.status);

    const now = new Date();
    const totals = await this.closeActiveInterval(session, now);
    const totalDurationSeconds = computeTotalDuration(totals);

    const isArtworkTask =
      task.workflowStep.stepType === 'VERIFICATION' ||
      task.workflowStep.stepCode === 'ARTWORK_VERIFICATION' ||
      task.workflowStep.stepCode?.includes('ARTWORK');

    await prisma.$transaction(async (tx) => {
      await tx.workflowTaskExecutionSession.update({
        where: { id: session.id },
        data: {
          status: WorkflowTaskExecutionSessionStatus.COMPLETED,
          completedAt: now,
          ...totals,
          totalDurationSeconds,
          activeIntervalStartedAt: null,
          activeIntervalType: null,
        },
      });

      if (isArtworkTask) {
        const instance = await tx.workflowInstance.findUnique({
          where: { id: task.workflowInstanceId },
          select: { productionOrderItemId: true, orderId: true },
        });

        if (instance?.productionOrderItemId) {
          const pendingArtworks = await tx.orderArtwork.findMany({
            where: {
              orderItemId: instance.productionOrderItemId,
              approvalStatus: 'PENDING',
            },
            select: { id: true },
          });

          for (const art of pendingArtworks) {
            await tx.orderArtwork.update({
              where: { id: art.id },
              data: {
                approvalStatus: 'APPROVED',
                approvedById: actorId,
                approvedAt: now,
              },
            });

            await recordOrderEvent(
              instance.orderId,
              {
                eventType: 'ARTWORK_APPROVED',
                title: 'Artwork approved',
                metadata: { orderArtworkId: art.id, autoApprovedOnComplete: true },
                actorId,
              },
              tx,
            );
          }
        }
      }
    }, EXECUTION_TX_OPTIONS);

    const advanceResult = await workflowEngine.advance({
      workflowInstanceId: task.workflowInstanceId,
      taskId,
      action: 'complete',
      actorId,
      remarks: body.remarks,
    });

    this.afterExecutionMutation(ActivityAction.TASK_COMPLETED, APP_EVENTS.TASK_COMPLETED, {
      taskId,
      sessionId: session.id,
      actorId,
      workflowInstanceId: task.workflowInstanceId,
      newlyReadyTaskIds: advanceResult.newlyReadyTaskIds,
    });

    if (task.assignedMachineId) {
      void machineService.releaseMachineIfIdle(task.assignedMachineId, actorId);
    }

    return {
      session: await this.getExecution(taskId),
      workflow: {
        taskStatus: advanceResult.taskStatus,
        workflowStatus: advanceResult.workflowStatus,
        workflowCompleted: advanceResult.workflowCompleted,
        newlyReadyTaskIds: advanceResult.newlyReadyTaskIds,
      },
    };
  }

  /**
   * Under Review (Verification) staff decides the order needs correction instead of approving
   * it — the counterpart to completeTask's "approve" path. Closes out the review session the same
   * way completeTask does, then hands the actual task-status change to workflowEngine, which is
   * also what surfaces the order as IMPROPER_ORDER.
   */
  async flagForCorrection(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: { reason: string },
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);
    if (task.workflowStep.stepType !== 'VERIFICATION') {
      throw ApiError.badRequest('Only Under Review (Verification) tasks can be flagged for correction');
    }

    const now = new Date();
    const totals = await this.closeActiveInterval(session, now);

    await prisma.workflowTaskExecutionSession.update({
      where: { id: session.id },
      data: {
        status: WorkflowTaskExecutionSessionStatus.COMPLETED,
        completedAt: now,
        ...totals,
        totalDurationSeconds: computeTotalDuration(totals),
        activeIntervalStartedAt: null,
        activeIntervalType: null,
      },
    });

    const result = await workflowEngine.flagTaskForCorrection({
      taskId,
      actorId,
      reason: body.reason,
    });

    this.afterExecutionMutation(ActivityAction.TASK_HELD, APP_EVENTS.TASK_HELD, {
      taskId,
      sessionId: session.id,
      actorId,
      reason: body.reason,
    });

    return { session: await this.getExecution(taskId), workflow: result };
  }

  /**
   * Whatever was wrong has been fixed — brings the flagged Verification task back into the
   * department queue. Not tied to a review session (there is nothing active to close; the task
   * has been sitting BLOCKED since it was flagged), so this only needs execute permission.
   */
  async resolveCorrection(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: { remarks?: string },
  ) {
    if (!canExecuteTasks(role, permissions)) {
      throw ApiError.forbidden('You do not have permission to resolve this order correction');
    }
    const result = await workflowEngine.resolveTaskCorrection({
      taskId,
      actorId,
      remarks: body.remarks,
    });
    return { workflow: result };
  }

  async addNote(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: AddNoteBody,
  ) {
    const task = await executionRepository.findTaskForExecution(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    this.assertNotQcExecutionTask(task.workflowStep.stepType);

    const assignment = await executionRepository.findActiveAssignment(taskId);
    const operatorId = assignment?.operatorId ?? actorId;
    assertCanExecuteTask(operatorId, actorId, role, permissions);

    const session = await executionRepository.findActiveSession(taskId);

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.workflowTaskProductionNote.create({
        data: {
          workflowTaskId: taskId,
          sessionId: session?.id,
          operatorId: actorId,
          departmentId: task.departmentId,
          text: body.text,
          fileAssetId: body.fileAssetId,
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
          operator: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, code: true, name: true } },
          fileAsset: {
            select: { id: true, originalName: true, fileUrl: true, mimeType: true },
          },
        },
      });

      return created;
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskNoteAdded({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        actorId,
      }),
    ]);

    this.afterExecutionMutation(ActivityAction.TASK_NOTE_ADDED, APP_EVENTS.TASK_NOTE_ADDED, {
      taskId,
      noteId: note.id,
      actorId,
    });

    return mapNoteToDto(note);
  }

  async presignAttachment(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: PresignAttachmentBody,
  ) {
    const task = await executionRepository.findTaskForExecution(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    this.assertNotQcExecutionTask(task.workflowStep.stepType);

    const assignment = await executionRepository.findActiveAssignment(taskId);
    if (!assignment) throw ApiError.conflict('Task must be assigned to upload attachments');
    assertCanExecuteTask(assignment.operatorId, actorId, role, permissions);

    return storageService.createPresignedProductionAttachmentUpload(
      taskId,
      body.fileName,
      body.contentType,
      body.fileSize,
    );
  }

  async registerAttachment(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: RegisterAttachmentBody,
  ) {
    const task = await executionRepository.findTaskForExecution(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    this.assertNotQcExecutionTask(task.workflowStep.stepType);

    const assignment = await executionRepository.findActiveAssignment(taskId);
    if (!assignment) throw ApiError.conflict('Task must be assigned to upload attachments');
    assertCanExecuteTask(assignment.operatorId, actorId, role, permissions);

    const session = await executionRepository.findActiveSession(taskId);
    const ext = resolveExtension(body.mimeType, body.originalName);

    const attachment = await prisma.$transaction(async (tx) => {
      const fileAsset = await tx.fileAsset.create({
        data: {
          originalName: sanitizeFileName(body.originalName),
          fileName: sanitizeFileName(body.originalName),
          fileKey: body.key,
          fileUrl: body.publicUrl,
          mimeType: body.mimeType,
          extension: ext,
          fileSize: body.fileSize,
          uploadedById: actorId,
        },
      });

      const created = await tx.workflowTaskAttachment.create({
        data: {
          workflowTaskId: taskId,
          sessionId: session?.id,
          fileAssetId: fileAsset.id,
          category: body.category,
          label: body.label,
          uploadedById: actorId,
        },
        select: {
          id: true,
          category: true,
          label: true,
          createdAt: true,
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          fileAsset: {
            select: {
              id: true,
              originalName: true,
              fileUrl: true,
              mimeType: true,
              fileSize: true,
            },
          },
        },
      });

      return created;
    }, EXECUTION_TX_OPTIONS);

    await this.recordTimelineEvents([
      workflowTimelineService.taskAttachmentAdded({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        category: body.category,
        actorId,
      }),
    ]);

    this.afterExecutionMutation(
      ActivityAction.TASK_ATTACHMENT_ADDED,
      APP_EVENTS.TASK_ATTACHMENT_ADDED,
      { taskId, attachmentId: attachment.id, actorId },
    );

    return mapAttachmentToDto(attachment);
  }

  async requestSupervisor(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: AlertBody,
  ) {
    return this.createAlert(
      taskId,
      actorId,
      role,
      permissions,
      ProductionExecutionAlertType.SUPERVISOR_REQUEST,
      ActivityAction.SUPERVISOR_REQUESTED,
      APP_EVENTS.SUPERVISOR_REQUESTED,
      body,
    );
  }

  async reportIssue(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    body: AlertBody,
  ) {
    return this.createAlert(
      taskId,
      actorId,
      role,
      permissions,
      ProductionExecutionAlertType.ISSUE_REPORT,
      ActivityAction.TASK_ISSUE_REPORTED,
      APP_EVENTS.TASK_ISSUE_REPORTED,
      body,
    );
  }

  async getExecution(taskId: string) {
    const active = await executionRepository.findActiveSession(taskId);
    if (active) return mapExecutionSessionToDto(active);

    const completed = await prisma.workflowTaskExecutionSession.findFirst({
      where: {
        workflowTaskId: taskId,
        status: WorkflowTaskExecutionSessionStatus.COMPLETED,
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });
    if (!completed) return null;

    const session = await executionRepository.findSessionById(completed.id);
    return session ? mapExecutionSessionToDto(session) : null;
  }

  async listNotes(taskId: string, cursor?: string, limit = 50) {
    const rows = await executionRepository.listNotes(taskId, cursor, limit);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(mapNoteToDto),
      meta: {
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        hasMore,
        limit,
      },
    };
  }

  async listAttachments(taskId: string, cursor?: string, limit = 50) {
    const rows = await executionRepository.listAttachments(taskId, cursor, limit);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(mapAttachmentToDto),
      meta: {
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        hasMore,
        limit,
      },
    };
  }

  async listDepartmentExecution(
    departmentId: string,
    query: DepartmentExecutionQuery,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanViewDepartmentExecution(role, permissions);
    const rows = await executionRepository.listDepartmentExecution(departmentId, query);
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const now = new Date();
    return {
      items: items.map((row) => mapDepartmentExecutionItem(row, now)),
      meta: {
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        hasMore,
        limit: query.limit,
      },
    };
  }

  private async loadActiveExecution(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const task = await executionRepository.findTaskForExecution(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    this.assertNotQcExecutionTask(task.workflowStep.stepType);

    const assignment = await executionRepository.findActiveAssignment(taskId);
    if (!assignment) throw ApiError.conflict('Task must be assigned for execution');
    assertCanExecuteTask(assignment.operatorId, actorId, role, permissions);

    const session = await executionRepository.findActiveSession(taskId);
    if (!session) throw ApiError.conflict('No active execution session. Start the task first.');

    return { task, session, assignment };
  }

  private async closeActiveInterval(
    session: {
      id: string;
      activeIntervalStartedAt: Date | null;
      activeIntervalType: WorkflowTaskExecutionIntervalType | null;
      workingDurationSeconds: number;
      pausedDurationSeconds: number;
      holdDurationSeconds: number;
    },
    now: Date,
  ): Promise<SessionTotals> {
    if (!session.activeIntervalStartedAt || !session.activeIntervalType) {
      return {
        workingDurationSeconds: session.workingDurationSeconds,
        pausedDurationSeconds: session.pausedDurationSeconds,
        holdDurationSeconds: session.holdDurationSeconds,
      };
    }

    const seconds = durationSeconds(session.activeIntervalStartedAt, now);

    await prisma.workflowTaskExecutionInterval.updateMany({
      where: {
        sessionId: session.id,
        endedAt: null,
        intervalType: session.activeIntervalType,
      },
      data: {
        endedAt: now,
        durationSeconds: seconds,
      },
    });

    return accumulateDuration(session.activeIntervalType, seconds, {
      workingDurationSeconds: session.workingDurationSeconds,
      pausedDurationSeconds: session.pausedDurationSeconds,
      holdDurationSeconds: session.holdDurationSeconds,
    });
  }

  private async createAlert(
    taskId: string,
    actorId: string,
    role: RoleName,
    permissions: string[],
    alertType: ProductionExecutionAlertType,
    activityAction: ActivityAction,
    eventName: (typeof APP_EVENTS)[keyof typeof APP_EVENTS],
    body: AlertBody,
  ) {
    const { task, session } = await this.loadActiveExecution(taskId, actorId, role, permissions);

    const alert = await prisma.$transaction(async (tx) => {
      const created = await tx.workflowTaskExecutionAlert.create({
        data: {
          workflowTaskId: taskId,
          sessionId: session.id,
          operatorId: actorId,
          alertType,
          notes: body.notes,
          metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      return created;
    }, EXECUTION_TX_OPTIONS);

    const timelineFactory =
      alertType === ProductionExecutionAlertType.SUPERVISOR_REQUEST
        ? workflowTimelineService.supervisorRequested
        : workflowTimelineService.issueReported;

    await this.recordTimelineEvents([
      timelineFactory({
        workflowInstanceId: task.workflowInstanceId,
        taskId,
        actorId,
        notes: body.notes,
      }),
    ]);

    this.afterExecutionMutation(activityAction, eventName, {
      taskId,
      alertId: alert.id,
      actorId,
    });

    return { id: alert.id, alertType, createdAt: alert.createdAt.toISOString() };
  }

  private async recordTimelineEvents(events: TimelineEventInput[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await prisma.$transaction(async (tx) => {
        await workflowTimelineService.recordEvents(events, tx);
      }, EXECUTION_TX_OPTIONS);
    } catch (error) {
      logger.warn('Failed to record workflow timeline events', {
        eventCount: events.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private afterExecutionMutation(
    action: ActivityAction,
    event: (typeof APP_EVENTS)[keyof typeof APP_EVENTS],
    payload: Record<string, unknown>,
  ): void {
    activityLogService.logAsync({
      action,
      entityType: 'workflow_task',
      entityId: String(payload['taskId']),
      actorId: payload['actorId'] as string | undefined,
      metadata: payload as Prisma.InputJsonValue,
    });
    eventBus.emitEvent(event, payload);
    void productionQueueCache.invalidateAll();
  }

  private assertNotQcExecutionTask(stepType: WorkflowStepType): void {
    if (stepType === WorkflowStepType.QUALITY_CHECK) {
      throw ApiError.conflict('QC tasks must be inspected via the Quality Control module');
    }
  }
}

export const executionService = new ExecutionService();
