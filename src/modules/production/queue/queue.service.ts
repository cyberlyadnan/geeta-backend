import type { RoleName } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import { assertDepartmentAccess } from './queue.access.js';
import { mapDepartmentListItem, mapQueueTaskCard, mapQueueTaskDetail } from './queue.dto.js';
import { productionQueueCache } from './queue.cache.js';
import { queueRepository } from './queue.repository.js';
import type { DepartmentQueueQuery } from './queue.validation.js';

export class QueueService {
  async listDepartments(_role: RoleName, _permissions: string[]) {
    return productionQueueCache.getDepartments(async () => {
      const departments = await queueRepository.listActiveDepartments(undefined);

      const items = await Promise.all(
        departments.map(async (dept) => {
          const counts = await queueRepository.getDepartmentCounts(dept.id);
          return mapDepartmentListItem({ ...dept, counts });
        }),
      );

      return { items };
    });
  }

  async getDepartmentQueue(
    departmentId: string,
    query: DepartmentQueueQuery,
    role: RoleName,
    permissions: string[],
  ) {
    const department = await queueRepository.findDepartmentById(departmentId);
    if (!department) throw ApiError.notFound('Department not found');

    assertDepartmentAccess(department.code, role, permissions);

    const queryKey = JSON.stringify({ departmentId, ...query });

    const result = await productionQueueCache.getDepartmentQueue(
      departmentId,
      queryKey,
      () => queueRepository.listDepartmentQueue(departmentId, query),
    );

    return {
      department,
      items: result.items.map(mapQueueTaskCard),
      meta: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        limit: result.limit,
      },
    };
  }

  async getTaskDetail(
    departmentId: string,
    taskId: string,
    role: RoleName,
    permissions: string[],
    requesterId?: string,
  ) {
    const department = await queueRepository.findDepartmentById(departmentId);
    if (!department) throw ApiError.notFound('Department not found');

    let hasAccess = false;
    try {
      assertDepartmentAccess(department.code, role, permissions);
      hasAccess = true;
    } catch {
      // If department access fails, check if the user is assigned to this task
      if (requesterId) {
        const isAssigned = await queueRepository.isTaskAssignedToUser(taskId, requesterId);
        if (isAssigned) hasAccess = true;
      }
    }
    if (!hasAccess) {
      throw ApiError.forbidden('You do not have access to this department queue');
    }

    const task = await queueRepository.findQueueTaskDetail(departmentId, taskId);
    if (!task) throw ApiError.notFound('Queue task not found');

    return {
      department,
      task: mapQueueTaskDetail(task),
    };
  }
}

export const queueService = new QueueService();
