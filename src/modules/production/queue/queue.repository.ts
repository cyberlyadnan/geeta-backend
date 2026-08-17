import {
  Prisma,
  WorkflowPriority,
  WorkflowTaskStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type { DepartmentQueueCountsDto } from './queue.dto.js';
import type { DepartmentQueueQuery } from './queue.validation.js';
import {
  buildQueueOrderBy,
  buildQueueTaskWhere,
  departmentCountsWhere,
} from './queue.filters.js';
import { RUSH_PRIORITIES } from './queue.constants.js';

export const QUEUE_TASK_LIST_SELECT = {
  id: true,
  workflowInstanceId: true,
  departmentId: true,
  status: true,
  priority: true,
  stepOrder: true,
  estimatedMinutes: true,
  queuedAt: true,
  dueAt: true,
  createdAt: true,
  assignedAt: true,
  department: { select: { id: true, code: true, name: true } },
  workflowStep: { select: { id: true, stepCode: true, stepName: true, stepType: true } },
  reworks: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
  assignments: {
    where: { status: 'ACTIVE' },
    take: 1,
    select: {
      id: true,
      status: true,
      assignedAt: true,
      priority: true,
      dueAt: true,
      operator: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  workflowInstance: {
    select: {
      id: true,
      status: true,
      currentStepOrder: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          orderName: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              vendorProfile: { select: { businessName: true, vendorCode: true } },
            },
          },
          retailCustomer: { select: { id: true, name: true, phone: true } },
        },
      },
      productionOrderItem: {
        select: {
          id: true,
          quantity: true,
          productSnapshot: true,
          productOfferingVersion: {
            select: {
              productOffering: {
                select: { id: true, name: true, displayName: true },
              },
            },
          },
        },
      },
      tasks: {
        select: { id: true, stepOrder: true, status: true },
        orderBy: { stepOrder: 'asc' as const },
      },
    },
  },
} satisfies Prisma.WorkflowTaskSelect;

export type QueueTaskListRecord = Prisma.WorkflowTaskGetPayload<{
  select: typeof QUEUE_TASK_LIST_SELECT;
}>;

export const QUEUE_TASK_DETAIL_SELECT = {
  ...QUEUE_TASK_LIST_SELECT,
  instructions: true,
  metadata: true,
  dependencies: {
    select: { id: true, dependsOnTaskId: true, dependencyType: true },
  },
  history: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    select: {
      id: true,
      action: true,
      remarks: true,
      createdAt: true,
      performedBy: { select: { firstName: true, lastName: true } },
    },
  },
  workflowInstance: {
    select: {
      ...QUEUE_TASK_LIST_SELECT.workflowInstance.select,
      order: {
        select: {
          ...QUEUE_TASK_LIST_SELECT.workflowInstance.select.order.select,
          estimatedCompletionAt: true,
          deliveryAddress: true,
        },
      },
      productionOrderItem: {
        select: {
          id: true,
          quantity: true,
          productSnapshot: true,
          configurationSnapshot: true,
          sizeSnapshot: true,
          productOfferingVersion: {
            select: {
              productOffering: {
                select: { id: true, name: true, displayName: true },
              },
              configurationFields: {
                select: {
                  code: true,
                  label: true,
                  relevantStepTypes: true,
                  options: { select: { value: true, label: true } },
                },
              },
            },
          },
          orderArtworks: {
            select: {
              id: true,
              fileRequirementCode: true,
              approvalStatus: true,
              artworkFile: {
                select: {
                  fileAsset: {
                    select: { fileUrl: true, originalName: true, mimeType: true },
                  },
                  versions: {
                    orderBy: { versionNumber: 'desc' as const },
                    take: 5,
                    select: {
                      id: true,
                      versionNumber: true,
                      previewUrl: true,
                      fileAsset: {
                        select: { fileUrl: true, originalName: true, mimeType: true },
                      },
                    },
                  },
                },
              },
              pinnedVersion: {
                select: {
                  artworkVersion: {
                    select: {
                      id: true,
                      versionNumber: true,
                      previewUrl: true,
                      fileAsset: {
                        select: { fileUrl: true, originalName: true, mimeType: true },
                      },
                    },
                  },
                },
              },
            },
          },
          files: {
            select: {
              id: true,
              fileRequirementCode: true,
              fileRequirementLabel: true,
              fileAsset: { select: { fileUrl: true, originalName: true } },
            },
          },
        },
      },
      tasks: {
        select: {
          id: true,
          stepOrder: true,
          status: true,
          workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
        },
        orderBy: { stepOrder: 'asc' as const },
      },
      timelineEvents: {
        orderBy: { createdAt: 'desc' as const },
        take: 100,
        select: {
          id: true,
          eventType: true,
          title: true,
          description: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.WorkflowTaskSelect;

export type QueueTaskDetailRecord = Prisma.WorkflowTaskGetPayload<{
  select: typeof QUEUE_TASK_DETAIL_SELECT;
}>;

export interface DepartmentListItemRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  counts: DepartmentQueueCountsDto;
}

export class QueueRepository {
  async listActiveDepartments(allowedCodes?: string[]) {
    return prisma.department.findMany({
      where: {
        isActive: true,
        ...(allowedCodes?.length
          ? { code: { in: allowedCodes.map((c) => c.toUpperCase()) } }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, description: true, sortOrder: true },
    });
  }

  async getDepartmentCounts(departmentId: string): Promise<DepartmentQueueCountsDto> {
    const { todayStart, todayEnd, now } = departmentCountsWhere(departmentId);

    const [statusGroups, rush, delayed, completedToday] = await Promise.all([
      prisma.workflowTask.groupBy({
        by: ['status'],
        where: { departmentId },
        _count: { _all: true },
      }),
      prisma.workflowTask.count({
        where: {
          departmentId,
          priority: { in: [...RUSH_PRIORITIES] as WorkflowPriority[] },
          status: {
            notIn: [
              WorkflowTaskStatus.COMPLETED,
              WorkflowTaskStatus.CANCELLED,
              WorkflowTaskStatus.SKIPPED,
            ],
          },
        },
      }),
      prisma.workflowTask.count({
        where: {
          departmentId,
          dueAt: { lt: now },
          status: {
            notIn: [
              WorkflowTaskStatus.COMPLETED,
              WorkflowTaskStatus.CANCELLED,
              WorkflowTaskStatus.SKIPPED,
            ],
          },
        },
      }),
      prisma.workflowTask.count({
        where: {
          departmentId,
          status: WorkflowTaskStatus.COMPLETED,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
    ]);

    const byStatus = new Map(statusGroups.map((g) => [g.status, g._count._all]));
    const ready = byStatus.get(WorkflowTaskStatus.READY) ?? 0;
    const blocked = byStatus.get(WorkflowTaskStatus.BLOCKED) ?? 0;
    const inProgress =
      (byStatus.get(WorkflowTaskStatus.IN_PROGRESS) ?? 0) +
      (byStatus.get(WorkflowTaskStatus.ASSIGNED) ?? 0);
    const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);

    return {
      ready,
      blocked,
      completedToday,
      rush,
      delayed,
      inProgress,
      total,
    };
  }

  async listDepartmentQueue(departmentId: string, query: DepartmentQueueQuery) {
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const where = buildQueueTaskWhere(departmentId, query);
    const orderBy = buildQueueOrderBy(query);

    const tasks = await prisma.workflowTask.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy,
      select: QUEUE_TASK_LIST_SELECT,
    });

    const hasMore = tasks.length > limit;
    const items = hasMore ? tasks.slice(0, limit) : tasks;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor, hasMore, limit };
  }

  async findDepartmentById(departmentId: string) {
    return prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true, code: true, name: true },
    });
  }

  async findQueueTaskDetail(departmentId: string, taskId: string) {
    return prisma.workflowTask.findFirst({
      where: { id: taskId, departmentId },
      select: QUEUE_TASK_DETAIL_SELECT,
    });
  }

  async isTaskAssignedToUser(taskId: string, userId: string): Promise<boolean> {
    const assignment = await prisma.workflowTaskAssignment.findFirst({
      where: { workflowTaskId: taskId, operatorId: userId, status: 'ACTIVE' },
      select: { id: true },
    });
    return assignment !== null;
  }
}

export const queueRepository = new QueueRepository();
