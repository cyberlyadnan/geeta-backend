import {
  Prisma,
  UserStatus,
  WorkflowTaskAssignmentStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type { MyTasksQuery, OperatorSearchQuery } from './assignment.validation.js';

export const ASSIGNMENT_SELECT = {
  id: true,
  workflowTaskId: true,
  operatorId: true,
  departmentId: true,
  machineId: true,
  assignedById: true,
  assignedAt: true,
  priority: true,
  dueAt: true,
  estimatedMinutes: true,
  remarks: true,
  status: true,
  supersededAt: true,
  createdAt: true,
  updatedAt: true,
  operator: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  assignedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  machine: {
    select: { id: true, machineCode: true, machineName: true },
  },
  department: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.WorkflowTaskAssignmentSelect;

export type AssignmentRecord = Prisma.WorkflowTaskAssignmentGetPayload<{
  select: typeof ASSIGNMENT_SELECT;
}>;

export const ASSIGNMENT_HISTORY_SELECT = {
  id: true,
  assignmentId: true,
  workflowTaskId: true,
  action: true,
  operatorId: true,
  previousOperatorId: true,
  priority: true,
  previousPriority: true,
  dueAt: true,
  previousDueAt: true,
  remarks: true,
  previousRemarks: true,
  machineId: true,
  previousMachineId: true,
  metadata: true,
  createdAt: true,
  performedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  operator: {
    select: { id: true, firstName: true, lastName: true },
  },
} satisfies Prisma.WorkflowTaskAssignmentHistorySelect;

export const MY_TASK_SELECT = {
  id: true,
  workflowTaskId: true,
  priority: true,
  dueAt: true,
  estimatedMinutes: true,
  remarks: true,
  status: true,
  assignedAt: true,
  machine: { select: { id: true, machineCode: true, machineName: true, machineType: true, operationalStatus: true, notes: true } },
  department: { select: { id: true, code: true, name: true } },
  workflowTask: {
    select: {
      id: true,
      status: true,
      stepOrder: true,
      workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
      workflowInstance: {
        select: {
          id: true,
          tasks: {
            select: {
              id: true,
              status: true,
              stepOrder: true,
              department: { select: { name: true, code: true } },
              workflowStep: { select: { stepCode: true, stepName: true, stepType: true, jobSlipBeforeThisStep: true } },
            },
            orderBy: { stepOrder: 'asc' as const },
          },
          // The card acts without a detail fetch, so the order identity, the vendor it belongs
          // to and the delivery address all travel with the list — a job slip printed straight
          // from the card needs every one of them.
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderName: true,
              deliveryAddress: true,
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
              quantity: true,
              configurationSnapshot: true,
              sizeSnapshot: true,
              productSnapshot: true,
              productOfferingVersion: {
                select: {
                  productOffering: { select: { name: true, displayName: true } },
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
              // Full artwork payload, not just the approval status. The verifier and the
              // designer download from the card itself now, so the list has to carry the file
              // URLs; the previous status-only select would have forced a second round trip per
              // card. `take: 5` on versions matches the detail view and bounds the payload.
              orderArtworks: {
                select: {
                  id: true,
                  fileRequirementCode: true,
                  approvalStatus: true,
                  resubmittedAt: true,
                  updatedAt: true,
                  artworkFile: {
                    select: {
                      fileAsset: { select: { fileUrl: true, originalName: true, mimeType: true } },
                    },
                  },
                  pinnedVersion: {
                    select: {
                      artworkVersion: {
                        select: {
                          id: true,
                          versionNumber: true,
                          previewUrl: true,
                          fileAsset: { select: { fileUrl: true, originalName: true, mimeType: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorkflowTaskAssignmentSelect;

export type AssignmentHistoryRecord = Prisma.WorkflowTaskAssignmentHistoryGetPayload<{
  select: typeof ASSIGNMENT_HISTORY_SELECT;
}>;

export type MyAssignedTaskRecord = Prisma.WorkflowTaskAssignmentGetPayload<{
  select: typeof MY_TASK_SELECT;
}>;

export class AssignmentRepository {
  findTaskForAssignment(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        departmentId: true,
        workflowInstanceId: true,
        status: true,
        priority: true,
        dueAt: true,
        estimatedMinutes: true,
        remarks: true,
        assignedToId: true,
        workflowStep: { select: { stepCode: true, stepName: true } },
      },
    });
  }

  findActiveAssignment(taskId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskAssignment.findFirst({
      where: { workflowTaskId: taskId, status: WorkflowTaskAssignmentStatus.ACTIVE },
      select: ASSIGNMENT_SELECT,
    });
  }

  findActiveAssignmentById(assignmentId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskAssignment.findUnique({
      where: { id: assignmentId },
      select: ASSIGNMENT_SELECT,
    });
  }

  findOperatorDepartmentAssignment(
    operatorId: string,
    departmentId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.userDepartmentAssignment.findFirst({
      where: {
        userId: operatorId,
        departmentId,
        isActive: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      select: { id: true, roleCode: true },
    });
  }

  findOperatorUser(operatorId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.user.findUnique({
      where: { id: operatorId },
      select: {
        id: true,
        status: true,
        firstName: true,
        lastName: true,
        email: true,
        role: { select: { name: true, permissions: true } },
      },
    });
  }

  /** Active operators in a department — used for auto-assignment round-robin. */
  listEligibleOperators(departmentId: string) {
    return prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        departmentAssignments: {
          some: {
            departmentId,
            isActive: true,
            roleCode: 'OPERATOR',
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }

  /** Last operator assigned any task in this department — round-robin cursor. */
  async getLastAssignmentOperatorInDepartment(departmentId: string): Promise<string | null> {
    const last = await prisma.workflowTaskAssignment.findFirst({
      where: { departmentId },
      orderBy: { assignedAt: 'desc' },
      select: { operatorId: true },
    });
    return last?.operatorId ?? null;
  }

  searchOperators(query: OperatorSearchQuery) {
    const where: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
      departmentAssignments: {
        some: {
          departmentId: query.departmentId,
          isActive: true,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
        },
      },
      ...(query.search?.trim()
        ? {
            OR: [
              { firstName: { contains: query.search.trim(), mode: 'insensitive' } },
              { lastName: { contains: query.search.trim(), mode: 'insensitive' } },
              { email: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.user.findMany({
      where,
      take: query.limit,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        departmentAssignments: {
          where: { departmentId: query.departmentId, isActive: true },
          select: { roleCode: true, isPrimary: true },
        },
      },
    });
  }

  listAssignmentHistory(taskId: string, cursor?: string, limit = 50) {
    return prisma.workflowTaskAssignmentHistory.findMany({
      where: { workflowTaskId: taskId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ASSIGNMENT_HISTORY_SELECT,
    });
  }

  async listMyTasks(operatorId: string, query: MyTasksQuery) {
    const limit = Math.min(Math.max(query.limit, 1), 100);
    const isCompleted = query.scope === 'completed';
    const isAwaitingChanges = query.scope === 'awaiting_changes';

    // Active: the operator's live queue — anything they still owe work on. Completed: what
    // they finished, so both the operator and admins can audit "who verified this order" —
    // multiple staff share a department, and losing that trail was the ask.
    const statusFilter = query.status
      ? { status: query.status as WorkflowTaskAssignmentStatus }
      : isCompleted
        ? {}
        : { status: WorkflowTaskAssignmentStatus.ACTIVE };

    const items = await prisma.workflowTaskAssignment.findMany({
      where: {
        operatorId,
        ...statusFilter,
        workflowTask: {
          status: isCompleted
            ? { in: [WorkflowTaskStatus.COMPLETED] }
            : {
                notIn: [
                  WorkflowTaskStatus.COMPLETED,
                  WorkflowTaskStatus.CANCELLED,
                  WorkflowTaskStatus.SKIPPED,
                ],
              },
          // "Awaiting changes" is the verifier's follow-up list: tasks where they asked the
          // vendor for a revision. Filtering on the artwork's own status keeps this accurate
          // whether or not the vendor has responded yet — the row itself says which.
          ...(isAwaitingChanges
            ? {
                workflowInstance: {
                  productionOrderItem: {
                    orderArtworks: {
                      some: {
                        OR: [
                          { approvalStatus: 'REVISION_REQUESTED' },
                          { resubmittedAt: { not: null } },
                        ],
                      },
                    },
                  },
                },
              }
            : {}),
        },
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      // Recent finishes first when reviewing completed; live queue keeps priority/due order.
      orderBy: isCompleted
        ? [{ workflowTask: { completedAt: 'desc' } }, { assignedAt: 'desc' }]
        : [{ priority: 'desc' }, { dueAt: 'asc' }, { assignedAt: 'asc' }],
      select: MY_TASK_SELECT,
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

    return { items: page, nextCursor, hasMore, limit };
  }
}

export const assignmentRepository = new AssignmentRepository();
