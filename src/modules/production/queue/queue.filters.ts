import {
  Prisma,
  WorkflowInstanceStatus,
  WorkflowPriority,
  WorkflowStepType,
  WorkflowTaskStatus,
} from '@prisma/client';
import type { DepartmentQueueQuery } from './queue.validation.js';
import { RUSH_PRIORITIES } from './queue.constants.js';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function buildQueueTaskWhere(
  departmentId: string,
  query: DepartmentQueueQuery,
): Prisma.WorkflowTaskWhereInput {
  const and: Prisma.WorkflowTaskWhereInput[] = [
    { departmentId },
    // VENDOR_APPROVAL tasks are gates the customer closes, not work anyone on the floor can do.
    // They would otherwise sit in a department queue as un-actionable clutter that no operator
    // can ever complete. The vendor portal surfaces them instead.
    { workflowStep: { stepType: { not: WorkflowStepType.VENDOR_APPROVAL } } },
  ];

  if (query.lens === 'rush') {
    and.push({ priority: { in: [...RUSH_PRIORITIES] as WorkflowPriority[] } });
  } else if (query.lens === 'rework') {
    and.push({ status: { in: [WorkflowTaskStatus.REWORK, WorkflowTaskStatus.REJECTED] } });
  } else if (query.lens === 'blocked') {
    and.push({ status: WorkflowTaskStatus.BLOCKED });
  } else if (query.lens === 'completedToday') {
    and.push({
      status: WorkflowTaskStatus.COMPLETED,
      completedAt: { gte: startOfToday(), lte: endOfToday() },
    });
  } else if (query.lens === 'delayed') {
    and.push({
      dueAt: { lt: new Date() },
      status: {
        notIn: [
          WorkflowTaskStatus.COMPLETED,
          WorkflowTaskStatus.CANCELLED,
          WorkflowTaskStatus.SKIPPED,
        ],
      },
    });
  }

  if (query.status) {
    and.push({ status: query.status });
  }

  if (query.priority) {
    and.push({ priority: query.priority });
  }

  if (query.workflowStatus) {
    and.push({ workflowInstance: { status: query.workflowStatus as WorkflowInstanceStatus } });
  }

  if (query.vendorId) {
    and.push({ workflowInstance: { order: { customerId: query.vendorId } } });
  }

  if (query.productId) {
    and.push({
      workflowInstance: {
        productionOrderItem: {
          productOfferingVersion: { productOfferingId: query.productId },
        },
      },
    });
  }

  if (query.orderNumber) {
    and.push({
      workflowInstance: {
        order: { orderNumber: { contains: query.orderNumber, mode: 'insensitive' } },
      },
    });
  }

  if (query.createdFrom || query.createdTo) {
    and.push({
      createdAt: {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      },
    });
  }

  if (query.dueFrom || query.dueTo) {
    and.push({
      dueAt: {
        ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
        ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
      },
    });
  }

  if (query.search?.trim()) {
    const term = query.search.trim();
    and.push({
      OR: [
        { id: term },
        { workflowInstanceId: term },
        { workflowInstance: { order: { orderNumber: { contains: term, mode: 'insensitive' } } } },
        {
          workflowInstance: {
            order: {
              customer: {
                OR: [
                  { firstName: { contains: term, mode: 'insensitive' } },
                  { lastName: { contains: term, mode: 'insensitive' } },
                  { vendorProfile: { businessName: { contains: term, mode: 'insensitive' } } },
                ],
              },
            },
          },
        },
        {
          workflowInstance: {
            productionOrderItem: {
              productOfferingVersion: {
                productOffering: {
                  OR: [
                    { name: { contains: term, mode: 'insensitive' } },
                    { displayName: { contains: term, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
      ],
    });
  }

  return { AND: and };
}

export function buildQueueOrderBy(
  query: DepartmentQueueQuery,
): Prisma.WorkflowTaskOrderByWithRelationInput[] {
  const direction = query.sortDir ?? 'asc';

  switch (query.sortBy) {
    case 'priority':
      return [{ priority: direction }, { dueAt: 'asc' }, { id: 'asc' }];
    case 'dueAt':
      return [{ dueAt: direction }, { priority: 'desc' }, { id: 'asc' }];
    case 'createdAt':
      return [{ createdAt: direction }, { id: 'asc' }];
    case 'stepOrder':
    default:
      return [{ stepOrder: direction }, { priority: 'desc' }, { id: 'asc' }];
  }
}

export function departmentCountsWhere(departmentId: string) {
  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const now = new Date();

  return {
    departmentId,
    todayStart,
    todayEnd,
    now,
  };
}
