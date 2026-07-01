import {
  Prisma,
  WorkflowTaskAssignmentStatus,
  WorkflowTaskExecutionSessionStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type { DepartmentExecutionQuery } from './execution.validation.js';
import { EXECUTION_ACTIVE_SESSION_STATUSES } from './execution.constants.js';

export const EXECUTION_SESSION_SELECT = {
  id: true,
  workflowTaskId: true,
  assignmentId: true,
  operatorId: true,
  departmentId: true,
  status: true,
  startedAt: true,
  pausedAt: true,
  resumedAt: true,
  completedAt: true,
  workingDurationSeconds: true,
  pausedDurationSeconds: true,
  holdDurationSeconds: true,
  totalDurationSeconds: true,
  activeIntervalStartedAt: true,
  activeIntervalType: true,
  createdAt: true,
  updatedAt: true,
  operator: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  department: { select: { id: true, code: true, name: true } },
} satisfies Prisma.WorkflowTaskExecutionSessionSelect;

export type ExecutionSessionRecord = Prisma.WorkflowTaskExecutionSessionGetPayload<{
  select: typeof EXECUTION_SESSION_SELECT;
}>;

export const TASK_EXECUTION_SELECT = {
  id: true,
  workflowInstanceId: true,
  departmentId: true,
  status: true,
  assignedToId: true,
  startedAt: true,
  completedAt: true,
  instructions: true,
  estimatedMinutes: true,
  workflowStep: { select: { stepCode: true, stepName: true } },
  workflowInstance: {
    select: {
      id: true,
      order: { select: { orderNumber: true, orderName: true } },
    },
  },
} satisfies Prisma.WorkflowTaskSelect;

export type TaskExecutionRecord = Prisma.WorkflowTaskGetPayload<{
  select: typeof TASK_EXECUTION_SELECT;
}>;

export const DEPARTMENT_EXECUTION_SELECT = {
  id: true,
  workflowTaskId: true,
  operatorId: true,
  departmentId: true,
  status: true,
  startedAt: true,
  completedAt: true,
  workingDurationSeconds: true,
  pausedDurationSeconds: true,
  holdDurationSeconds: true,
  totalDurationSeconds: true,
  activeIntervalStartedAt: true,
  activeIntervalType: true,
  operator: { select: { id: true, firstName: true, lastName: true } },
  workflowTask: {
    select: {
      id: true,
      status: true,
      priority: true,
      dueAt: true,
      workflowStep: { select: { stepCode: true, stepName: true } },
      workflowInstance: {
        select: {
          order: { select: { orderNumber: true, orderName: true } },
        },
      },
    },
  },
} satisfies Prisma.WorkflowTaskExecutionSessionSelect;

export class ExecutionRepository {
  findTaskForExecution(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTask.findUnique({
      where: { id: taskId },
      select: TASK_EXECUTION_SELECT,
    });
  }

  findActiveAssignment(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskAssignment.findFirst({
      where: { workflowTaskId: taskId, status: WorkflowTaskAssignmentStatus.ACTIVE },
      select: { id: true, operatorId: true, departmentId: true },
    });
  }

  findActiveSession(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskExecutionSession.findFirst({
      where: {
        workflowTaskId: taskId,
        status: { in: [...EXECUTION_ACTIVE_SESSION_STATUSES] },
      },
      select: EXECUTION_SESSION_SELECT,
    });
  }

  findSessionById(sessionId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskExecutionSession.findUnique({
      where: { id: sessionId },
      select: EXECUTION_SESSION_SELECT,
    });
  }

  findOpenHold(sessionId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskHold.findFirst({
      where: { sessionId, releasedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  listNotes(taskId: string, cursor?: string, limit = 50) {
    return prisma.workflowTaskProductionNote.findMany({
      where: { workflowTaskId: taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
  }

  listAttachments(taskId: string, cursor?: string, limit = 50) {
    return prisma.workflowTaskAttachment.findMany({
      where: { workflowTaskId: taskId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        category: true,
        label: true,
        createdAt: true,
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        fileAsset: {
          select: { id: true, originalName: true, fileUrl: true, mimeType: true, fileSize: true },
        },
      },
    });
  }

  listDepartmentExecution(departmentId: string, query: DepartmentExecutionQuery) {
    const statusFilter = query.status
      ? query.status
      : { in: ['IN_PROGRESS', 'PAUSED', 'ON_HOLD'] as WorkflowTaskExecutionSessionStatus[] };

    return prisma.workflowTaskExecutionSession.findMany({
      where: {
        departmentId,
        status: statusFilter,
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: DEPARTMENT_EXECUTION_SELECT,
    });
  }
}

export const executionRepository = new ExecutionRepository();
