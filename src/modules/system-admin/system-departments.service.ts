import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { productionQueueCache } from '../production/queue/queue.cache.js';
import { resolveFacilityId } from './ensure-default-facility.js';
import type { CreateDepartmentInput, CursorQuery, UpdateDepartmentInput } from './system-admin.validation.js';

export class SystemDepartmentsService {
  async list(query: CursorQuery) {
    const limit = query.limit;
    const rows = await prisma.department.findMany({
      where: query.search?.trim()
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
              { code: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : undefined,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        facilityId: true,
        name: true,
        code: true,
        description: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        facility: { select: { id: true, code: true, name: true } },
        _count: {
          select: {
            staffAssignments: { where: { isActive: true } },
            machines: { where: { isActive: true } },
            workflowSteps: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const enriched = await Promise.all(
      items.map(async (dept) => {
        const supervisors = await prisma.userDepartmentAssignment.findMany({
          where: { departmentId: dept.id, roleCode: 'SUPERVISOR', isActive: true },
          take: 3,
          select: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });
        return {
          ...dept,
          operatorCount: dept._count.staffAssignments,
          machineCount: dept._count.machines,
          stepCount: dept._count.workflowSteps,
          managers: supervisors.map((s) => s.user),
        };
      }),
    );

    return {
      items: enriched,
      meta: { nextCursor: hasMore ? items[items.length - 1]?.id : undefined, hasMore, limit },
    };
  }

  async getById(departmentId: string) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        facility: { select: { id: true, code: true, name: true } },
        staffAssignments: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true, status: true },
            },
          },
        },
        machines: {
          where: { isActive: true },
          select: { id: true, machineCode: true, machineName: true, operationalStatus: true },
        },
      },
    });
    if (!dept) throw ApiError.notFound('Department not found');
    return dept;
  }

  async create(input: CreateDepartmentInput) {
    const existing = await prisma.department.findUnique({ where: { code: input.code } });
    if (existing) throw ApiError.conflict('Department code already exists');

    const facilityId = await resolveFacilityId(input.facilityId);

    const dept = await prisma.department.create({
      data: {
        ...input,
        facilityId,
      },
    });

    await productionQueueCache.invalidateAll();
    return dept;
  }

  async update(departmentId: string, input: UpdateDepartmentInput) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw ApiError.notFound('Department not found');

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: input,
    });

    await productionQueueCache.invalidateAll();
    return updated;
  }
}

export const systemDepartmentsService = new SystemDepartmentsService();
