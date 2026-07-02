import { prisma } from '../../config/database.js';
import type { CursorQuery } from './system-admin.validation.js';

export class SystemDebugService {
  async overview() {
    const [
      templateCount,
      instanceCount,
      taskCount,
      assignmentCount,
      sessionCount,
      inspectionCount,
      machineCount,
      departmentCount,
      userCount,
      timelineCount,
      activityCount,
      orderEventCount,
    ] = await Promise.all([
      prisma.workflowTemplate.count(),
      prisma.workflowInstance.count(),
      prisma.workflowTask.count(),
      prisma.workflowTaskAssignment.count({ where: { status: 'ACTIVE' } }),
      prisma.workflowTaskExecutionSession.count(),
      prisma.qualityInspection.count(),
      prisma.machine.count({ where: { isActive: true } }),
      prisma.department.count({ where: { isActive: true } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.workflowTimelineEvent.count(),
      prisma.activityLog.count(),
      prisma.productionOrderEvent.count(),
    ]);

    return {
      counts: {
        workflowTemplates: templateCount,
        workflowInstances: instanceCount,
        workflowTasks: taskCount,
        activeAssignments: assignmentCount,
        executionSessions: sessionCount,
        qualityInspections: inspectionCount,
        machines: machineCount,
        departments: departmentCount,
        users: userCount,
        timelineEvents: timelineCount,
        activityLogs: activityCount,
        orderEvents: orderEventCount,
      },
    };
  }

  async listEntities(
    entity:
      | 'workflow-templates'
      | 'workflow-instances'
      | 'workflow-tasks'
      | 'assignments'
      | 'execution-sessions'
      | 'qc-inspections'
      | 'machines'
      | 'departments'
      | 'users'
      | 'timeline'
      | 'activity'
      | 'order-events',
    query: CursorQuery,
  ) {
    const limit = query.limit;
    const search = query.search?.trim();

    switch (entity) {
      case 'workflow-templates':
        return this.paginate(
          prisma.workflowTemplate.findMany({
            where: search
              ? { OR: [{ code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }] }
              : undefined,
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { updatedAt: 'desc' },
            select: { id: true, code: true, name: true, status: true, isDefault: true, updatedAt: true },
          }),
          limit,
        );
      case 'workflow-instances':
        return this.paginate(
          prisma.workflowInstance.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              status: true,
              currentStepOrder: true,
              orderId: true,
              workflowTemplate: { select: { code: true, name: true } },
              updatedAt: true,
            },
          }),
          limit,
        );
      case 'workflow-tasks':
        return this.paginate(
          prisma.workflowTask.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              status: true,
              priority: true,
              stepOrder: true,
              department: { select: { code: true, name: true } },
              workflowStep: { select: { stepName: true, stepCode: true } },
              updatedAt: true,
            },
          }),
          limit,
        );
      case 'assignments':
        return this.paginate(
          prisma.workflowTaskAssignment.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { assignedAt: 'desc' },
            select: {
              id: true,
              status: true,
              assignedAt: true,
              operator: { select: { email: true, firstName: true, lastName: true } },
              machine: { select: { machineCode: true } },
            },
          }),
          limit,
        );
      case 'execution-sessions':
        return this.paginate(
          prisma.workflowTaskExecutionSession.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { startedAt: 'desc' },
            select: {
              id: true,
              status: true,
              startedAt: true,
              completedAt: true,
              workingDurationSeconds: true,
              operator: { select: { email: true } },
            },
          }),
          limit,
        );
      case 'qc-inspections':
        return this.paginate(
          prisma.qualityInspection.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              result: true,
              createdAt: true,
              workflowTask: { select: { workflowStep: { select: { stepName: true } } } },
            },
          }),
          limit,
        );
      case 'machines':
        return this.paginate(
          prisma.machine.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              machineCode: true,
              machineName: true,
              operationalStatus: true,
              department: { select: { code: true } },
            },
          }),
          limit,
        );
      case 'departments':
        return this.paginate(
          prisma.department.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { sortOrder: 'asc' },
            select: { id: true, code: true, name: true, isActive: true, sortOrder: true },
          }),
          limit,
        );
      case 'users':
        return this.paginate(
          prisma.user.findMany({
            where: { deletedAt: null },
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
              role: { select: { name: true } },
            },
          }),
          limit,
        );
      case 'timeline':
        return this.paginate(
          prisma.workflowTimelineEvent.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              eventType: true,
              title: true,
              entityType: true,
              entityId: true,
              createdAt: true,
            },
          }),
          limit,
        );
      case 'activity':
        return this.paginate(
          prisma.activityLog.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              createdAt: true,
              actor: { select: { email: true } },
            },
          }),
          limit,
        );
      case 'order-events':
        return this.paginate(
          prisma.productionOrderEvent.findMany({
            take: limit + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            orderBy: { createdAt: 'desc' },
            select: { id: true, orderId: true, eventType: true, title: true, createdAt: true },
          }),
          limit,
        );
      default:
        return { items: [], meta: { hasMore: false, limit } };
    }
  }

  private paginate<T extends { id: string }>(rows: Promise<T[]>, limit: number) {
    return rows.then((all) => {
      const hasMore = all.length > limit;
      const items = hasMore ? all.slice(0, limit) : all;
      return {
        items,
        meta: { nextCursor: hasMore ? items[items.length - 1]?.id : undefined, hasMore, limit },
      };
    });
  }
}

export const systemDebugService = new SystemDebugService();
