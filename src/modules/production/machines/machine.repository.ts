import { createHash } from 'node:crypto';
import {
  MachineOperationalStatus,
  Prisma,
  WorkflowTaskAssignmentStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { redisCache } from '../../../common/cache/redis-cache.js';
import { MACHINE_CACHE_PREFIX, MACHINE_LIST_TTL_SEC } from './machine.constants.js';
import type { ListMachinesQuery } from './machine.validation.js';

export const MACHINE_DETAIL_SELECT = {
  id: true,
  facilityId: true,
  departmentId: true,
  machineCode: true,
  machineName: true,
  machineType: true,
  manufacturer: true,
  model: true,
  capabilities: true,
  supportedProcesses: true,
  minSheetWidthMm: true,
  minSheetHeightMm: true,
  maxSheetWidthMm: true,
  maxSheetHeightMm: true,
  maxPrintWidthMm: true,
  maxPrintHeightMm: true,
  speedRating: true,
  capacityPerHour: true,
  workingHours: true,
  averageRuntimeMinutes: true,
  supportedProductIds: true,
  operationalStatus: true,
  isActive: true,
  notes: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, code: true, name: true } },
  facility: { select: { id: true, code: true, name: true } },
} satisfies Prisma.MachineSelect;

export type MachineDetailRecord = Prisma.MachineGetPayload<{ select: typeof MACHINE_DETAIL_SELECT }>;

export const MACHINE_LIST_SELECT = {
  id: true,
  machineCode: true,
  machineName: true,
  machineType: true,
  departmentId: true,
  operationalStatus: true,
  isActive: true,
  capacityPerHour: true,
  manufacturer: true,
  model: true,
  department: { select: { id: true, code: true, name: true } },
} satisfies Prisma.MachineSelect;

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export class MachineRepository {
  findById(machineId: string) {
    return prisma.machine.findUnique({
      where: { id: machineId },
      select: MACHINE_DETAIL_SELECT,
    });
  }

  findByCode(machineCode: string) {
    return prisma.machine.findUnique({
      where: { machineCode: machineCode.toUpperCase() },
      select: { id: true },
    });
  }

  async list(query: ListMachinesQuery) {
    const limit = query.limit;
    const where: Prisma.MachineWhereInput = {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.facilityId ? { facilityId: query.facilityId } : {}),
      ...(query.operationalStatus ? { operationalStatus: query.operationalStatus } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { machineCode: { contains: query.search.trim(), mode: 'insensitive' } },
              { machineName: { contains: query.search.trim(), mode: 'insensitive' } },
              { manufacturer: { contains: query.search.trim(), mode: 'insensitive' } },
              { model: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await prisma.machine.findMany({
      where,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ isActive: 'desc' }, { machineCode: 'asc' }],
      select: MACHINE_LIST_SELECT,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      hasMore,
      limit,
    };
  }

  listCached(query: ListMachinesQuery) {
    const key = `${MACHINE_CACHE_PREFIX}list:${hashKey(JSON.stringify(query))}`;
    return redisCache.getOrLoad(key, MACHINE_LIST_TTL_SEC, () => this.list(query));
  }

  async getOverview() {
    const [total, statusGroups, activeAssignments] = await Promise.all([
      prisma.machine.count({ where: { isActive: true } }),
      prisma.machine.groupBy({
        by: ['operationalStatus'],
        where: { isActive: true },
        _count: { _all: true },
      }),
      prisma.workflowTaskAssignment.count({
        where: {
          status: WorkflowTaskAssignmentStatus.ACTIVE,
          machineId: { not: null },
        },
      }),
    ]);

    const byStatus = new Map(statusGroups.map((g) => [g.operationalStatus, g._count._all]));
    const available = byStatus.get(MachineOperationalStatus.AVAILABLE) ?? 0;
    const busy = byStatus.get(MachineOperationalStatus.BUSY) ?? 0;
    const maintenance = byStatus.get(MachineOperationalStatus.MAINTENANCE) ?? 0;
    const offline = byStatus.get(MachineOperationalStatus.OFFLINE) ?? 0;
    const reserved = byStatus.get(MachineOperationalStatus.RESERVED) ?? 0;
    const utilizationPercent = total > 0 ? Math.round(((busy + reserved) / total) * 100) : 0;

    return {
      totalMachines: total,
      available,
      busy,
      reserved,
      maintenance,
      offline,
      activeAssignments,
      utilizationPercent,
    };
  }

  getHistory(machineId: string) {
    return Promise.all([
      prisma.machineStatusHistory.findMany({
        where: { machineId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          workflowTaskId: true,
          assignmentId: true,
          createdAt: true,
          changedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.machineMaintenanceRecord.findMany({
        where: { machineId },
        orderBy: { startedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          title: true,
          description: true,
          startedAt: true,
          endedAt: true,
          performedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.workflowTaskAssignment.findMany({
        where: { machineId },
        orderBy: { assignedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          status: true,
          assignedAt: true,
          supersededAt: true,
          workflowTask: {
            select: {
              id: true,
              status: true,
              workflowStep: { select: { stepName: true } },
              workflowInstance: {
                select: { order: { select: { orderNumber: true } } },
              },
            },
          },
          operator: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.workflowTaskAssignment.findFirst({
        where: { machineId, status: WorkflowTaskAssignmentStatus.ACTIVE },
        select: {
          id: true,
          workflowTask: {
            select: {
              id: true,
              status: true,
              workflowStep: { select: { stepName: true } },
              workflowInstance: {
                select: { order: { select: { orderNumber: true } } },
              },
            },
          },
        },
      }),
      prisma.workflowTask.count({
        where: { assignedMachineId: machineId, status: 'COMPLETED' },
      }),
    ]);
  }

  countActiveAssignments(machineId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.workflowTaskAssignment.count({
      where: { machineId, status: WorkflowTaskAssignmentStatus.ACTIVE },
    });
  }
}

export const machineRepository = new MachineRepository();
