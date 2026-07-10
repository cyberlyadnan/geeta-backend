import { eventBus, APP_EVENTS } from '../eventBus.js';
import { prisma } from '../../config/database.js';
import { notifyUser } from '../../modules/orders/order-events.service.js';
import { assignmentRepository } from '../../modules/production/assignment/assignment.repository.js';
import { logger } from '../../logs/logger.js';

interface TaskAssignedPayload {
  assignmentId: string;
  taskId: string;
  operatorId: string;
  actorId: string;
}

export function registerAssignmentNotificationListeners(): void {
  eventBus.on(APP_EVENTS.TASK_ASSIGNED, (payload: TaskAssignedPayload) => {
    void (async () => {
      try {
        const task = await assignmentRepository.findTaskForAssignment(payload.taskId);
        if (!task) return;

        const instance = await prisma.workflowInstance.findUnique({
          where: { id: task.workflowInstanceId },
          select: {
            order: { select: { orderNumber: true, orderName: true } },
          },
        });

        const isRush = task.priority === 'URGENT' || task.priority === 'HIGH';
        const orderLabel = instance?.order.orderNumber ?? 'Production order';
        const productLabel = instance?.order.orderName ?? task.workflowStep.stepName;

        await notifyUser(payload.operatorId, {
          type: isRush ? 'TASK_ASSIGNED_RUSH' : 'TASK_ASSIGNED',
          title: isRush ? 'Rush order assigned' : `New ${task.workflowStep.stepName} task`,
          body: `${orderLabel} · ${productLabel}`,
          entityType: 'workflow_task',
          entityId: payload.taskId,
          metadata: {
            assignmentId: payload.assignmentId,
            departmentId: task.departmentId,
            stepCode: task.workflowStep.stepCode,
            stepName: task.workflowStep.stepName,
            priority: task.priority,
          },
        });
      } catch (error) {
        logger.error('TASK_ASSIGNED notification failed', {
          payload,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}
