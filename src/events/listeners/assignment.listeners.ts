import { eventBus, APP_EVENTS } from '../eventBus.js';
import { assignmentService } from '../../modules/production/assignment/assignment.service.js';
import { logger } from '../../logs/logger.js';

interface TaskReadyPayload {
  workflowInstanceId: string;
  taskId?: string;
}

export function registerAssignmentListeners(): void {
  eventBus.on(APP_EVENTS.TASK_READY, (payload: TaskReadyPayload) => {
    const taskId = payload.taskId;
    if (!taskId) return;

    void assignmentService.tryAutoAssignReadyTask(taskId).catch((error) => {
      logger.error('TASK_READY auto-assign handler error', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}
