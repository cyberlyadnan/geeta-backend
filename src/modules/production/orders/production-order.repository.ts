import { createHash } from 'node:crypto';
import {
  Prisma,
  ProductionOrderStatus,
  QualityInspectionResult,
  WorkflowPriority,
  WorkflowTaskAssignmentStatus,
  WorkflowTaskExecutionSessionStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { redisCache } from '../../../common/cache/redis-cache.js';
import { ORDER_DETAIL_SELECT } from '../../../repositories/order.repository.js';
import {
  ACTIVE_TASK_STATUSES,
  PRODUCTION_ORDER_CACHE_PREFIX,
  PRODUCTION_ORDER_DETAIL_TTL_SEC,
  PRODUCTION_ORDER_LIST_TTL_SEC,
  RUSH_PRIORITIES,
  TERMINAL_TASK_STATUSES,
} from './production-order.constants.js';
import type { ActivityQuery, ListProductionOrdersQuery, TimelineQuery } from './production-order.validation.js';

export const PRODUCTION_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  orderName: true,
  status: true,
  deliveryType: true,
  deliveryStatus: true,
  deliveryRequired: true,
  walletDeducted: true,
  estimatedCompletionAt: true,
  createdAt: true,
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      vendorProfile: { select: { id: true, businessName: true, vendorCode: true } },
    },
  },
  items: {
    take: 1,
    select: {
      id: true,
      quantity: true,
      productOfferingVersion: {
        select: {
          productOffering: {
            select: { id: true, name: true, displayName: true, thumbnailUrl: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductionOrderSelect;

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function buildListWhere(query: ListProductionOrdersQuery): Prisma.ProductionOrderWhereInput {
  const now = new Date();
  const taskFilter: Prisma.WorkflowTaskWhereInput = {
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.rush ? { priority: { in: [...RUSH_PRIORITIES] as WorkflowPriority[] } } : {}),
    ...(query.delayed
      ? {
          dueAt: { lt: now },
          status: { notIn: [...TERMINAL_TASK_STATUSES] as WorkflowTaskStatus[] },
        }
      : {}),
    ...(query.onHold ? { status: WorkflowTaskStatus.ON_HOLD } : {}),
    ...(query.operatorId
      ? {
          assignments: {
            some: { operatorId: query.operatorId, status: WorkflowTaskAssignmentStatus.ACTIVE },
          },
        }
      : {}),
    ...(query.machineId
      ? {
          OR: [
            { assignedMachineId: query.machineId },
            {
              assignments: {
                some: { machineId: query.machineId, status: WorkflowTaskAssignmentStatus.ACTIVE },
              },
            },
          ],
        }
      : {}),
    ...(query.qcFailed
      ? {
          qualityInspections: {
            some: { result: QualityInspectionResult.FAIL },
          },
        }
      : {}),
    ...(query.rework
      ? {
          OR: [{ status: WorkflowTaskStatus.REWORK }, { reworks: { some: {} } }],
        }
      : {}),
  };

  const hasTaskFilter = Object.keys(taskFilter).length > 0;

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.vendorId ? { customerId: query.vendorId } : {}),
    ...(query.productId
      ? {
          items: {
            some: {
              productOfferingVersion: { productOfferingId: query.productId },
            },
          },
        }
      : {}),
    ...(query.paymentStatus === 'PAID' ? { walletDeducted: true } : {}),
    ...(query.paymentStatus === 'UNPAID' ? { walletDeducted: false } : {}),
    ...(query.deliveryType ? { deliveryType: query.deliveryType } : {}),
    ...(query.fromDate || query.toDate
      ? {
          createdAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
          },
        }
      : {}),
    ...(query.workflowStatus
      ? { workflowInstances: { some: { status: query.workflowStatus } } }
      : {}),
    ...(query.onHold && !hasTaskFilter
      ? { status: ProductionOrderStatus.ON_HOLD }
      : {}),
    ...(hasTaskFilter
      ? { workflowInstances: { some: { tasks: { some: taskFilter } } } }
      : {}),
    ...(query.search?.trim()
      ? {
          OR: [
            { orderNumber: { contains: query.search.trim(), mode: 'insensitive' } },
            { orderName: { contains: query.search.trim(), mode: 'insensitive' } },
            {
              customer: {
                vendorProfile: {
                  businessName: { contains: query.search.trim(), mode: 'insensitive' },
                },
              },
            },
            {
              customer: {
                OR: [
                  { firstName: { contains: query.search.trim(), mode: 'insensitive' } },
                  { lastName: { contains: query.search.trim(), mode: 'insensitive' } },
                  { email: { contains: query.search.trim(), mode: 'insensitive' } },
                ],
              },
            },
            {
              items: {
                some: {
                  productOfferingVersion: {
                    productOffering: {
                      OR: [
                        { name: { contains: query.search.trim(), mode: 'insensitive' } },
                        { displayName: { contains: query.search.trim(), mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            },
            {
              workflowInstances: {
                some: { id: { contains: query.search.trim(), mode: 'insensitive' } },
              },
            },
          ],
        }
      : {}),
  };
}

export class ProductionOrderRepository {
  async list(query: ListProductionOrdersQuery) {
    const limit = query.limit;
    const where = buildListWhere(query);

    const rows = await prisma.productionOrder.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: PRODUCTION_ORDER_LIST_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const orderIds = items.map((row) => row.id);
    const contextMap = await this.fetchOrderContextMap(orderIds);

    return {
      items: items.map((row) => ({ ...row, context: contextMap.get(row.id) ?? null })),
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      limit,
    };
  }

  listCached(query: ListProductionOrdersQuery) {
    const key = `${PRODUCTION_ORDER_CACHE_PREFIX}list:${hashKey(JSON.stringify(query))}`;
    return redisCache.getOrLoad(key, PRODUCTION_ORDER_LIST_TTL_SEC, () => this.list(query));
  }

  findById(orderId: string) {
    return prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        ...ORDER_DETAIL_SELECT,
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            vendorProfile: {
              select: {
                id: true,
                vendorCode: true,
                businessName: true,
                ownerName: true,
                accountStatus: true,
              },
            },
          },
        },
      },
    });
  }

  findByIdCached(orderId: string) {
    const key = `${PRODUCTION_ORDER_CACHE_PREFIX}detail:${orderId}`;
    return redisCache.getOrLoad(key, PRODUCTION_ORDER_DETAIL_TTL_SEC, () => this.findById(orderId));
  }

  async fetchOrderContextMap(orderIds: string[]) {
    if (orderIds.length === 0) return new Map<string, OrderContext>();

    const instances = await prisma.workflowInstance.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        orderId: true,
        status: true,
        currentStepOrder: true,
        tasks: {
          orderBy: { stepOrder: 'asc' },
          select: {
            id: true,
            status: true,
            stepOrder: true,
            priority: true,
            dueAt: true,
            department: { select: { id: true, code: true, name: true } },
            workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
            assignedMachineId: true,
            assignedMachine: {
              select: { id: true, machineCode: true, machineName: true },
            },
            assignments: {
              where: { status: WorkflowTaskAssignmentStatus.ACTIVE },
              take: 1,
              select: {
                operator: { select: { id: true, firstName: true, lastName: true } },
                machine: { select: { id: true, machineCode: true, machineName: true } },
              },
            },
            reworks: { select: { id: true } },
            qualityInspections: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { result: true, status: true },
            },
          },
        },
      },
    });

    const map = new Map<string, OrderContext>();
    for (const instance of instances) {
      const currentTask =
        instance.tasks.find((t) => ACTIVE_TASK_STATUSES.includes(t.status as (typeof ACTIVE_TASK_STATUSES)[number])) ??
        instance.tasks.find((t) => !TERMINAL_TASK_STATUSES.includes(t.status as (typeof TERMINAL_TASK_STATUSES)[number]));

      const reworkCount = instance.tasks.reduce((sum, t) => sum + t.reworks.length, 0);
      const qcFailed = instance.tasks.some(
        (t) => t.qualityInspections[0]?.result === QualityInspectionResult.FAIL,
      );

      map.set(instance.orderId, {
        workflowInstanceId: instance.id,
        workflowStatus: instance.status,
        currentStepOrder: instance.currentStepOrder,
        currentTask,
        reworkCount,
        qcFailed,
      });
    }
    return map;
  }

  getWorkflow(orderId: string) {
    return prisma.workflowInstance.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        currentStepOrder: true,
        startedAt: true,
        completedAt: true,
        workflowTemplate: { select: { id: true, name: true, code: true } },
        tasks: {
          orderBy: { stepOrder: 'asc' },
          select: {
            id: true,
            status: true,
            stepOrder: true,
            priority: true,
            dueAt: true,
            startedAt: true,
            completedAt: true,
            department: { select: { id: true, code: true, name: true } },
            workflowStep: {
              select: { stepCode: true, stepName: true, stepType: true, expectedMinutes: true },
            },
          },
        },
      },
    });
  }

  getTasks(orderId: string) {
    return prisma.workflowInstance.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        tasks: {
          orderBy: { stepOrder: 'asc' },
          select: {
            id: true,
            status: true,
            stepOrder: true,
            priority: true,
            dueAt: true,
            startedAt: true,
            completedAt: true,
            instructions: true,
            assignedMachineId: true,
            department: { select: { id: true, code: true, name: true } },
            workflowStep: { select: { stepCode: true, stepName: true, stepType: true } },
            assignedMachine: {
              select: { id: true, machineCode: true, machineName: true, operationalStatus: true },
            },
            assignments: {
              where: { status: WorkflowTaskAssignmentStatus.ACTIVE },
              take: 1,
              select: {
                id: true,
                status: true,
                assignedAt: true,
                operator: { select: { id: true, firstName: true, lastName: true, email: true } },
                machine: { select: { id: true, machineCode: true, machineName: true } },
              },
            },
            reworks: { select: { id: true, reworkCycle: true, reason: true, createdAt: true } },
            attachments: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                category: true,
                createdAt: true,
                fileAsset: { select: { originalName: true, fileUrl: true, mimeType: true } },
              },
            },
            productionNotes: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                text: true,
                createdAt: true,
                operator: { select: { firstName: true, lastName: true } },
              },
            },
            executionSessions: {
              where: { status: WorkflowTaskExecutionSessionStatus.COMPLETED },
              select: { totalDurationSeconds: true },
            },
          },
        },
      },
    });
  }

  getTimeline(orderId: string, query: TimelineQuery) {
    return prisma.workflowTimelineEvent.findMany({
      where: {
        workflowInstance: { orderId },
        ...(query.eventType ? { eventType: query.eventType } : {}),
        ...(query.search?.trim()
          ? {
              OR: [
                { title: { contains: query.search.trim(), mode: 'insensitive' } },
                { description: { contains: query.search.trim(), mode: 'insensitive' } },
                { eventType: { contains: query.search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        eventType: true,
        title: true,
        description: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  getOrderEvents(orderId: string) {
    return prisma.productionOrderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        eventType: true,
        title: true,
        description: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  getActivity(orderId: string, query: ActivityQuery) {
    return prisma.activityLog.findMany({
      where: {
        OR: [{ entityType: 'production_order', entityId: orderId }, { entityId: orderId }],
      },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  getAssignmentHistory(orderId: string) {
    return prisma.workflowTaskAssignmentHistory.findMany({
      where: { workflowTask: { workflowInstance: { orderId } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        machineId: true,
        previousMachineId: true,
        priority: true,
        previousPriority: true,
        remarks: true,
        createdAt: true,
        operator: { select: { firstName: true, lastName: true } },
        performedBy: { select: { firstName: true, lastName: true } },
        workflowTask: {
          select: {
            workflowStep: { select: { stepName: true } },
          },
        },
      },
    });
  }

  getQcHistory(orderId: string) {
    return prisma.qualityInspection.findMany({
      where: { workflowTask: { workflowInstance: { orderId } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        result: true,
        remarks: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        reworkCycle: true,
        workflowTask: {
          select: {
            id: true,
            workflowStep: { select: { stepName: true } },
          },
        },
        inspector: { select: { firstName: true, lastName: true } },
        items: { select: { itemCode: true, label: true, passed: true, remarks: true } },
        defects: {
          select: {
            id: true,
            category: true,
            severity: true,
            description: true,
            createdAt: true,
          },
        },
        attachments: {
          select: {
            id: true,
            createdAt: true,
            fileAsset: { select: { originalName: true, fileUrl: true, mimeType: true } },
          },
        },
      },
    });
  }

  getFiles(orderId: string) {
    return prisma.workflowInstance.findFirst({
      where: { orderId },
      select: {
        tasks: {
          select: {
            id: true,
            workflowStep: { select: { stepName: true } },
            attachments: {
              select: {
                id: true,
                category: true,
                createdAt: true,
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
            },
          },
        },
        order: {
          select: {
            items: {
              select: {
                id: true,
                orderArtworks: {
                  select: {
                    id: true,
                    fileRequirementCode: true,
                    approvalStatus: true,
                    artworkFile: {
                      select: {
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
                    },
                    pinnedVersion: {
                      select: {
                        artworkVersion: {
                          select: {
                            previewUrl: true,
                            fileAsset: {
                              select: {
                                id: true,
                                originalName: true,
                                fileUrl: true,
                                mimeType: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                files: {
                  select: {
                    fileRequirementCode: true,
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
                },
              },
            },
          },
        },
      },
    });
  }

  getJobCardData(orderId: string) {
    return prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        orderName: true,
        status: true,
        notes: true,
        estimatedCompletionAt: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            vendorProfile: { select: { businessName: true } },
          },
        },
        items: {
          select: {
            id: true,
            quantity: true,
            productOfferingVersion: {
              select: {
                productOffering: { select: { name: true, displayName: true } },
              },
            },
            orderArtworks: {
              take: 1,
              select: {
                pinnedVersion: {
                  select: {
                    artworkVersion: { select: { previewUrl: true } },
                  },
                },
              },
            },
          },
        },
        jobCards: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, jobCardNumber: true, qrCode: true, snapshot: true },
        },
        workflowInstances: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            tasks: {
              orderBy: { stepOrder: 'asc' },
              select: {
                id: true,
                status: true,
                priority: true,
                dueAt: true,
                instructions: true,
                workflowStep: { select: { stepName: true, stepCode: true } },
                department: { select: { name: true } },
                assignments: {
                  where: { status: WorkflowTaskAssignmentStatus.ACTIVE },
                  take: 1,
                  select: {
                    operator: { select: { firstName: true, lastName: true } },
                    machine: { select: { machineCode: true, machineName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}

export type OrderContext = {
  workflowInstanceId: string;
  workflowStatus: string;
  currentStepOrder: number;
  currentTask: {
    id: string;
    status: string;
    stepOrder: number;
    priority: string;
    dueAt: Date | null;
    department: { id: string; code: string; name: string };
    workflowStep: { stepCode: string; stepName: string; stepType: string };
    assignedMachineId: string | null;
    assignedMachine: { id: string; machineCode: string; machineName: string } | null;
    assignments: Array<{
      operator: { id: string; firstName: string; lastName: string };
      machine: { id: string; machineCode: string; machineName: string } | null;
    }>;
    reworks: Array<{ id: string }>;
    qualityInspections: Array<{ result: string | null; status: string }>;
  } | undefined;
  reworkCount: number;
  qcFailed: boolean;
};

export const productionOrderRepository = new ProductionOrderRepository();
