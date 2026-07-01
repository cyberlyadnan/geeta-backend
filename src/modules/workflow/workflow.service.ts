import { RoleName } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';
import { orderRepository } from '../../repositories/order.repository.js';
import { workflowRepository } from './workflow.repository.js';
import { workflowEngine } from './workflow.engine.js';
import {
  mapTimelineEventToDto,
  mapWorkflowInstanceToDto,
  mapWorkflowTaskToDto,
} from './workflow.utils.js';
import type { AdvanceWorkflowBody, WorkflowCursorQuery } from './workflow.validation.js';

export class WorkflowService {
  async getById(id: string, userId?: string, role?: RoleName) {
    const instance = await workflowRepository.findInstanceById(id);
    if (!instance) throw ApiError.notFound('Workflow instance not found');
    await this.assertWorkflowAccess(instance.orderId, userId, role);
    return mapWorkflowInstanceToDto(instance);
  }

  async getByOrderId(orderId: string, userId?: string, role?: RoleName) {
    await this.assertWorkflowAccess(orderId, userId, role);
    const instance = await workflowRepository.findInstanceByOrderId(orderId);
    if (!instance) throw ApiError.notFound('Workflow instance not found for order');
    return mapWorkflowInstanceToDto(instance);
  }

  private async assertWorkflowAccess(orderId: string, userId?: string, role?: RoleName) {
    if (!userId || !role || role !== RoleName.VENDOR) return;

    const order = await orderRepository.findByIdForCustomer(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');
  }

  async getTasks(workflowInstanceId: string, query: WorkflowCursorQuery) {
    const instance = await workflowRepository.findInstanceById(workflowInstanceId);
    if (!instance) throw ApiError.notFound('Workflow instance not found');

    const { items, nextCursor, hasMore } = await workflowRepository.listTasksByInstanceId(
      workflowInstanceId,
      query,
    );

    return {
      items: items.map(mapWorkflowTaskToDto),
      meta: { nextCursor, hasMore, limit: query.limit },
    };
  }

  async getTimeline(workflowInstanceId: string, query: WorkflowCursorQuery) {
    const instance = await workflowRepository.findInstanceById(workflowInstanceId);
    if (!instance) throw ApiError.notFound('Workflow instance not found');

    const { items, nextCursor, hasMore } = await workflowRepository.listTimelineEvents(
      workflowInstanceId,
      query,
    );

    return {
      items: items.map(mapTimelineEventToDto),
      meta: { nextCursor, hasMore, limit: query.limit },
    };
  }

  async advance(workflowInstanceId: string, body: AdvanceWorkflowBody, actorId?: string) {
    const result = await workflowEngine.advance({
      workflowInstanceId,
      taskId: body.taskId,
      action: body.action,
      remarks: body.remarks,
      actorId,
    });

    return result;
  }
}

export const workflowService = new WorkflowService();
