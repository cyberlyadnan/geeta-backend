import {
  ActivityAction,
  RoleName,
  WorkflowHistoryAction,
  WorkflowTaskAssignmentHistoryAction,
  WorkflowTaskAssignmentStatus,
  WorkflowTaskStatus,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { eventBus, APP_EVENTS } from '../../../events/eventBus.js';
import { activityLogService } from '../../../services/activity/activity-log.service.js';
import { assertTaskTransition, isTaskTerminal } from '../../workflow/task-state-machine.js';
import { workflowTimelineService } from '../../workflow/workflow-timeline.service.js';
import { productionQueueCache } from '../queue/queue.cache.js';
import { assertCanAssignTasks } from './assignment.access.js';
import { ASSIGNMENT_TIMELINE_EVENTS } from './assignment.constants.js';
import {
  mapAssignmentHistoryToDto,
  mapAssignmentToDto,
  mapMyAssignedTask,
  mapOperatorToDto,
} from './assignment.dto.js';
import { assignmentRepository } from './assignment.repository.js';
import { assignmentStrategyService } from './assignment.strategy.js';
import { machineService } from '../machines/machine.service.js';
import { ASSIGNABLE_MACHINE_STATUSES } from '../machines/machine.constants.js';
import { logger } from '../../../logs/logger.js';
import type {
  AssignTaskBody,
  MyTasksQuery,
  OperatorSearchQuery,
  ReassignTaskBody,
  UnassignTaskBody,
} from './assignment.validation.js';

const ASSIGNABLE_TASK_STATUSES: WorkflowTaskStatus[] = [
  WorkflowTaskStatus.READY,
  WorkflowTaskStatus.ASSIGNED,
];

const AUTO_ASSIGN_ENABLED = process.env['PRODUCTION_AUTO_ASSIGN'] !== 'false';

let cachedSystemAssignerId: string | null = null;

export class AssignmentService {
  async assign(
    body: AssignTaskBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanAssignTasks(role, permissions);
    await this.validateAssignmentTarget(body.taskId, body.operatorId, body.machineId);

    const task = await assignmentRepository.findTaskForAssignment(body.taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    if (isTaskTerminal(task.status)) {
      throw ApiError.conflict(`Cannot assign task in terminal state ${task.status}`);
    }
    if (!ASSIGNABLE_TASK_STATUSES.includes(task.status)) {
      throw ApiError.conflict(`Task must be READY or ASSIGNED to assign (current: ${task.status})`);
    }

    const existing = await assignmentRepository.findActiveAssignment(body.taskId);
    if (existing) {
      throw ApiError.conflict('Task already has an active assignment. Use reassign instead.');
    }

    const priority = body.priority ?? task.priority;
    const dueAt = body.dueAt ? new Date(body.dueAt) : task.dueAt;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      if (task.status === WorkflowTaskStatus.READY) {
        assertTaskTransition(task.status, WorkflowTaskStatus.ASSIGNED);
      }

      const assignment = await tx.workflowTaskAssignment.create({
        data: {
          workflowTaskId: body.taskId,
          operatorId: body.operatorId,
          departmentId: task.departmentId,
          machineId: body.machineId ?? null,
          assignedById: actorId,
          assignedAt: now,
          priority,
          dueAt,
          estimatedMinutes: task.estimatedMinutes,
          remarks: body.remarks ?? task.remarks,
          status: WorkflowTaskAssignmentStatus.ACTIVE,
        },
        select: { id: true },
      });

      await tx.workflowTask.update({
        where: { id: body.taskId },
        data: {
          assignedToId: body.operatorId,
          assignedDepartmentId: task.departmentId,
          assignedMachineId: body.machineId ?? null,
          assignedAt: now,
          priority,
          dueAt,
          remarks: body.remarks ?? task.remarks,
          status: WorkflowTaskStatus.ASSIGNED,
        },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: body.taskId,
          action: WorkflowHistoryAction.ASSIGNED,
          remarks: body.remarks,
          performedById: actorId,
        },
      });

      await tx.workflowTaskAssignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          workflowTaskId: body.taskId,
          action: WorkflowTaskAssignmentHistoryAction.ASSIGNED,
          operatorId: body.operatorId,
          priority,
          dueAt,
          remarks: body.remarks ?? null,
          machineId: body.machineId ?? null,
          performedById: actorId,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          {
            workflowInstanceId: task.workflowInstanceId,
            entityType: 'WORKFLOW_TASK',
            entityId: body.taskId,
            eventType: ASSIGNMENT_TIMELINE_EVENTS.TASK_ASSIGNED,
            title: 'Task assigned',
            description: `Assigned to operator for ${task.workflowStep.stepName}`,
            metadata: {
              assignmentId: assignment.id,
              operatorId: body.operatorId,
              machineId: body.machineId ?? null,
            },
            actorId,
          },
        ],
        tx,
      );

      return { assignmentId: assignment.id };
    });

    const assignment = await assignmentRepository.findActiveAssignmentById(result.assignmentId);
    if (!assignment) throw ApiError.internal('Assignment creation failed');

    this.afterAssignmentMutation(ActivityAction.TASK_ASSIGNED, APP_EVENTS.TASK_ASSIGNED, {
      assignmentId: assignment.id,
      taskId: body.taskId,
      operatorId: body.operatorId,
      actorId,
    });

    if (body.machineId) {
      void machineService.onMachineAssigned(body.machineId, body.taskId, assignment.id, actorId);
    }

    return mapAssignmentToDto(assignment);
  }

  async reassign(
    assignmentId: string,
    body: ReassignTaskBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanAssignTasks(role, permissions);

    const current = await assignmentRepository.findActiveAssignmentById(assignmentId);
    if (!current || current.status !== WorkflowTaskAssignmentStatus.ACTIVE) {
      throw ApiError.notFound('Active assignment not found');
    }

    const task = await assignmentRepository.findTaskForAssignment(current.workflowTaskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    if (isTaskTerminal(task.status)) {
      throw ApiError.conflict(`Cannot reassign task in terminal state ${task.status}`);
    }

    const nextOperatorId = body.operatorId ?? current.operatorId;
    if (body.operatorId) {
      await this.validateAssignmentTarget(current.workflowTaskId, body.operatorId, body.machineId ?? undefined);
    }

    const nextPriority = body.priority ?? current.priority;
    const nextDueAt =
      body.dueAt === null ? null : body.dueAt ? new Date(body.dueAt) : current.dueAt;
    const nextMachineId =
      body.machineId === null ? null : body.machineId ?? current.machineId;
    const nextRemarks = body.remarks !== undefined ? body.remarks : current.remarks;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      await tx.workflowTaskAssignment.update({
        where: { id: assignmentId },
        data: {
          status: WorkflowTaskAssignmentStatus.SUPERSEDED,
          supersededAt: now,
        },
      });

      const newAssignment = await tx.workflowTaskAssignment.create({
        data: {
          workflowTaskId: current.workflowTaskId,
          operatorId: nextOperatorId,
          departmentId: current.departmentId,
          machineId: nextMachineId,
          assignedById: actorId,
          assignedAt: now,
          priority: nextPriority,
          dueAt: nextDueAt,
          estimatedMinutes: current.estimatedMinutes,
          remarks: nextRemarks,
          status: WorkflowTaskAssignmentStatus.ACTIVE,
        },
        select: { id: true },
      });

      await tx.workflowTask.update({
        where: { id: current.workflowTaskId },
        data: {
          assignedToId: nextOperatorId,
          assignedMachineId: nextMachineId,
          assignedAt: now,
          priority: nextPriority,
          dueAt: nextDueAt,
          remarks: nextRemarks,
          status: WorkflowTaskStatus.ASSIGNED,
        },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: current.workflowTaskId,
          action: WorkflowHistoryAction.REASSIGNED,
          remarks: body.remarks,
          performedById: actorId,
        },
      });

      const historyAction =
        nextOperatorId !== current.operatorId
          ? WorkflowTaskAssignmentHistoryAction.OPERATOR_CHANGED
          : WorkflowTaskAssignmentHistoryAction.REASSIGNED;

      await tx.workflowTaskAssignmentHistory.create({
        data: {
          assignmentId: newAssignment.id,
          workflowTaskId: current.workflowTaskId,
          action: historyAction,
          operatorId: nextOperatorId,
          previousOperatorId: current.operatorId,
          priority: nextPriority,
          previousPriority: current.priority,
          dueAt: nextDueAt,
          previousDueAt: current.dueAt,
          remarks: nextRemarks,
          previousRemarks: current.remarks,
          machineId: nextMachineId,
          previousMachineId: current.machineId,
          performedById: actorId,
        },
      });

      if (nextPriority !== current.priority) {
        await tx.workflowTaskAssignmentHistory.create({
          data: {
            assignmentId: newAssignment.id,
            workflowTaskId: current.workflowTaskId,
            action: WorkflowTaskAssignmentHistoryAction.PRIORITY_CHANGED,
            priority: nextPriority,
            previousPriority: current.priority,
            performedById: actorId,
          },
        });
      }

      if ((nextDueAt?.getTime() ?? null) !== (current.dueAt?.getTime() ?? null)) {
        await tx.workflowTaskAssignmentHistory.create({
          data: {
            assignmentId: newAssignment.id,
            workflowTaskId: current.workflowTaskId,
            action: WorkflowTaskAssignmentHistoryAction.DUE_DATE_CHANGED,
            dueAt: nextDueAt,
            previousDueAt: current.dueAt,
            performedById: actorId,
          },
        });
      }

      await workflowTimelineService.recordEvents(
        [
          {
            workflowInstanceId: task.workflowInstanceId,
            entityType: 'WORKFLOW_TASK',
            entityId: current.workflowTaskId,
            eventType: ASSIGNMENT_TIMELINE_EVENTS.TASK_REASSIGNED,
            title: 'Task reassigned',
            description: `Reassigned for ${task.workflowStep.stepName}`,
            metadata: {
              previousAssignmentId: assignmentId,
              assignmentId: newAssignment.id,
              operatorId: nextOperatorId,
            },
            actorId,
          },
        ],
        tx,
      );

      return { assignmentId: newAssignment.id, taskId: current.workflowTaskId, operatorId: nextOperatorId };
    });

    const assignment = await assignmentRepository.findActiveAssignmentById(result.assignmentId);
    if (!assignment) throw ApiError.internal('Reassignment failed');

    this.afterAssignmentMutation(ActivityAction.TASK_REASSIGNED, APP_EVENTS.TASK_REASSIGNED, {
      assignmentId: assignment.id,
      taskId: result.taskId,
      operatorId: result.operatorId,
      actorId,
    });

    if (body.priority && body.priority !== current.priority) {
      eventBus.emitEvent(APP_EVENTS.TASK_PRIORITY_CHANGED, {
        taskId: result.taskId,
        assignmentId: assignment.id,
        priority: body.priority,
      });
    }

    if (body.dueAt !== undefined) {
      eventBus.emitEvent(APP_EVENTS.TASK_DUE_DATE_CHANGED, {
        taskId: result.taskId,
        assignmentId: assignment.id,
        dueAt: body.dueAt,
      });
    }

    if (current.machineId && current.machineId !== nextMachineId) {
      void machineService.releaseMachineIfIdle(current.machineId, actorId);
    }
    if (nextMachineId) {
      void machineService.onMachineAssigned(
        nextMachineId,
        current.workflowTaskId,
        assignment.id,
        actorId,
      );
    }

    return mapAssignmentToDto(assignment);
  }

  async unassign(
    assignmentId: string,
    body: UnassignTaskBody,
    actorId: string,
    role: RoleName,
    permissions: string[],
  ) {
    assertCanAssignTasks(role, permissions);

    const current = await assignmentRepository.findActiveAssignmentById(assignmentId);
    if (!current || current.status !== WorkflowTaskAssignmentStatus.ACTIVE) {
      throw ApiError.notFound('Active assignment not found');
    }

    const task = await assignmentRepository.findTaskForAssignment(current.workflowTaskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    if (isTaskTerminal(task.status)) {
      throw ApiError.conflict(`Cannot unassign task in terminal state ${task.status}`);
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (task.status === WorkflowTaskStatus.ASSIGNED) {
        assertTaskTransition(task.status, WorkflowTaskStatus.READY);
      }

      await tx.workflowTaskAssignment.update({
        where: { id: assignmentId },
        data: { status: WorkflowTaskAssignmentStatus.UNASSIGNED, supersededAt: now },
      });

      await tx.workflowTask.update({
        where: { id: current.workflowTaskId },
        data: {
          assignedToId: null,
          assignedMachineId: null,
          assignedDepartmentId: null,
          assignedAt: null,
          status: WorkflowTaskStatus.READY,
          remarks: body.remarks ?? task.remarks,
        },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: current.workflowTaskId,
          action: WorkflowHistoryAction.UNASSIGNED,
          remarks: body.remarks,
          performedById: actorId,
        },
      });

      await tx.workflowTaskAssignmentHistory.create({
        data: {
          assignmentId,
          workflowTaskId: current.workflowTaskId,
          action: WorkflowTaskAssignmentHistoryAction.UNASSIGNED,
          operatorId: current.operatorId,
          previousOperatorId: current.operatorId,
          performedById: actorId,
          remarks: body.remarks ?? null,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          {
            workflowInstanceId: task.workflowInstanceId,
            entityType: 'WORKFLOW_TASK',
            entityId: current.workflowTaskId,
            eventType: ASSIGNMENT_TIMELINE_EVENTS.TASK_UNASSIGNED,
            title: 'Task unassigned',
            description: body.remarks ?? 'Assignment removed',
            metadata: { assignmentId },
            actorId,
          },
        ],
        tx,
      );
    });

    this.afterAssignmentMutation(ActivityAction.TASK_UNASSIGNED, APP_EVENTS.TASK_UNASSIGNED, {
      assignmentId,
      taskId: current.workflowTaskId,
      operatorId: current.operatorId,
      actorId,
    });

    if (current.machineId) {
      void machineService.releaseMachineIfIdle(current.machineId, actorId);
    }

    return { success: true, taskId: current.workflowTaskId };
  }

  async getCurrentAssignment(taskId: string) {
    const assignment = await assignmentRepository.findActiveAssignment(taskId);
    if (!assignment) return null;
    return mapAssignmentToDto(assignment);
  }

  async getAssignmentHistory(taskId: string, cursor?: string, limit = 50) {
    const task = await assignmentRepository.findTaskForAssignment(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');

    const rows = await assignmentRepository.listAssignmentHistory(taskId, cursor, limit);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return {
      items: items.map(mapAssignmentHistoryToDto),
      meta: { nextCursor, hasMore, limit },
    };
  }

  async searchOperators(query: OperatorSearchQuery, role: RoleName, permissions: string[]) {
    assertCanAssignTasks(role, permissions);
    const operators = await assignmentRepository.searchOperators(query);
    return { items: operators.map(mapOperatorToDto) };
  }

  async listMyTasks(
    operatorId: string,
    query: MyTasksQuery,
    requesterId: string,
    role: RoleName,
    permissions: string[],
  ) {
    const { assertCanViewOperatorTasks } = await import('./assignment.access.js');
    assertCanViewOperatorTasks(operatorId, requesterId, role, permissions);

    const result = await assignmentRepository.listMyTasks(operatorId, query);
    return {
      items: result.items.map(mapMyAssignedTask),
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, limit: result.limit },
    };
  }

  /**
   * Auto-assign when a task becomes READY (invoked from TASK_READY listener).
   * Uses round-robin per department — strategy extensible later.
   */
  async tryAutoAssignReadyTask(taskId: string): Promise<void> {
    if (!AUTO_ASSIGN_ENABLED) return;

    const task = await assignmentRepository.findTaskForAssignment(taskId);
    if (!task) return;
    if (task.status !== WorkflowTaskStatus.READY) return;
    if (isTaskTerminal(task.status)) return;

    const existing = await assignmentRepository.findActiveAssignment(taskId);
    if (existing) return;

    const operatorId = await assignmentStrategyService.pickOperator(task.departmentId);
    if (!operatorId) {
      logger.warn('Auto-assign skipped: no eligible operators', {
        taskId,
        departmentId: task.departmentId,
      });
      return;
    }

    const actorId = await this.resolveSystemAssignerId();
    await this.validateAssignmentTarget(taskId, operatorId);

    try {
      await this.persistAssignment({
        taskId,
        operatorId,
        actorId,
        remarks: 'Auto-assigned on task ready',
      });
      logger.info('Task auto-assigned', { taskId, operatorId, departmentId: task.departmentId });
    } catch (error) {
      logger.error('Auto-assign failed', {
        taskId,
        operatorId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async resolveSystemAssignerId(): Promise<string> {
    if (process.env['SYSTEM_ASSIGNER_USER_ID']) {
      return process.env['SYSTEM_ASSIGNER_USER_ID'];
    }
    if (cachedSystemAssignerId) return cachedSystemAssignerId;

    const admin = await prisma.user.findFirst({
      where: { status: 'ACTIVE', role: { name: RoleName.SUPER_ADMIN } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      cachedSystemAssignerId = admin.id;
      return admin.id;
    }

    const manager = await prisma.user.findFirst({
      where: { status: 'ACTIVE', role: { name: RoleName.MANAGER } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (manager) {
      cachedSystemAssignerId = manager.id;
      return manager.id;
    }

    throw ApiError.internal('No system assigner user configured for auto-assignment');
  }

  private async persistAssignment(input: {
    taskId: string;
    operatorId: string;
    actorId: string;
    machineId?: string;
    priority?: string;
    dueAt?: Date | null;
    remarks?: string | null;
  }) {
    const task = await assignmentRepository.findTaskForAssignment(input.taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');
    if (!ASSIGNABLE_TASK_STATUSES.includes(task.status)) {
      throw ApiError.conflict(`Task must be READY or ASSIGNED to assign (current: ${task.status})`);
    }

    const existing = await assignmentRepository.findActiveAssignment(input.taskId);
    if (existing) {
      throw ApiError.conflict('Task already has an active assignment');
    }

    const priority = (input.priority as typeof task.priority) ?? task.priority;
    const dueAt = input.dueAt !== undefined ? input.dueAt : task.dueAt;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      if (task.status === WorkflowTaskStatus.READY) {
        assertTaskTransition(task.status, WorkflowTaskStatus.ASSIGNED);
      }

      const assignment = await tx.workflowTaskAssignment.create({
        data: {
          workflowTaskId: input.taskId,
          operatorId: input.operatorId,
          departmentId: task.departmentId,
          machineId: input.machineId ?? null,
          assignedById: input.actorId,
          assignedAt: now,
          priority,
          dueAt,
          estimatedMinutes: task.estimatedMinutes,
          remarks: input.remarks ?? task.remarks,
          status: WorkflowTaskAssignmentStatus.ACTIVE,
        },
        select: { id: true },
      });

      await tx.workflowTask.update({
        where: { id: input.taskId },
        data: {
          assignedToId: input.operatorId,
          assignedDepartmentId: task.departmentId,
          assignedMachineId: input.machineId ?? null,
          assignedAt: now,
          priority,
          dueAt,
          remarks: input.remarks ?? task.remarks,
          status: WorkflowTaskStatus.ASSIGNED,
        },
      });

      await tx.workflowTaskHistory.create({
        data: {
          taskId: input.taskId,
          action: WorkflowHistoryAction.ASSIGNED,
          remarks: input.remarks,
          performedById: input.actorId,
        },
      });

      await tx.workflowTaskAssignmentHistory.create({
        data: {
          assignmentId: assignment.id,
          workflowTaskId: input.taskId,
          action: WorkflowTaskAssignmentHistoryAction.ASSIGNED,
          operatorId: input.operatorId,
          priority,
          dueAt,
          remarks: input.remarks ?? null,
          machineId: input.machineId ?? null,
          performedById: input.actorId,
        },
      });

      await workflowTimelineService.recordEvents(
        [
          {
            workflowInstanceId: task.workflowInstanceId,
            entityType: 'WORKFLOW_TASK',
            entityId: input.taskId,
            eventType: ASSIGNMENT_TIMELINE_EVENTS.TASK_ASSIGNED,
            title: 'Task assigned',
            description: `Assigned to operator for ${task.workflowStep.stepName}`,
            metadata: {
              assignmentId: assignment.id,
              operatorId: input.operatorId,
              machineId: input.machineId ?? null,
              autoAssigned: input.remarks?.includes('Auto-assigned') ?? false,
            },
            actorId: input.actorId,
          },
        ],
        tx,
      );

      return { assignmentId: assignment.id };
    });

    const assignment = await assignmentRepository.findActiveAssignmentById(result.assignmentId);
    if (!assignment) throw ApiError.internal('Assignment creation failed');

    this.afterAssignmentMutation(ActivityAction.TASK_ASSIGNED, APP_EVENTS.TASK_ASSIGNED, {
      assignmentId: assignment.id,
      taskId: input.taskId,
      operatorId: input.operatorId,
      actorId: input.actorId,
    });

    if (input.machineId) {
      void machineService.onMachineAssigned(
        input.machineId,
        input.taskId,
        assignment.id,
        input.actorId,
      );
    }

    return assignment;
  }

  private async validateAssignmentTarget(
    taskId: string,
    operatorId: string,
    machineId?: string,
  ): Promise<void> {
    const task = await assignmentRepository.findTaskForAssignment(taskId);
    if (!task) throw ApiError.notFound('Workflow task not found');

    const operator = await assignmentRepository.findOperatorUser(operatorId);
    if (!operator) throw ApiError.notFound('Operator not found');
    if (operator.status !== 'ACTIVE') {
      throw ApiError.badRequest('Operator account is not active');
    }

    const deptAssignment = await assignmentRepository.findOperatorDepartmentAssignment(
      operatorId,
      task.departmentId,
    );
    if (!deptAssignment) {
      throw ApiError.badRequest('Operator is not assigned to this task department');
    }

    if (machineId) {
      const machine = await prisma.machine.findFirst({
        where: {
          id: machineId,
          departmentId: task.departmentId,
          isActive: true,
          operationalStatus: { in: [...ASSIGNABLE_MACHINE_STATUSES] },
        },
        select: { id: true },
      });
      if (!machine) {
        throw ApiError.badRequest(
          'Machine not found, inactive, or not available for assignment in this department',
        );
      }
    }
  }

  private afterAssignmentMutation(
    activityAction: ActivityAction,
    event: (typeof APP_EVENTS)[keyof typeof APP_EVENTS],
    payload: {
      assignmentId: string;
      taskId: string;
      operatorId: string;
      actorId: string;
    },
  ): void {
    activityLogService.logAsync({
      action: activityAction,
      entityType: 'workflow_task_assignment',
      entityId: payload.assignmentId,
      actorId: payload.actorId,
      metadata: {
        taskId: payload.taskId,
        operatorId: payload.operatorId,
      } as Prisma.InputJsonValue,
    });

    eventBus.emitEvent(event, payload);
    void productionQueueCache.invalidateAll();
  }
}

export const assignmentService = new AssignmentService();
