import { eventBus, APP_EVENTS } from '../eventBus.js';
import { logger } from '../../logs/logger.js';

interface WorkflowCreatedPayload {
  workflowInstanceId: string;
  orderId: string;
  productionOrderItemId: string;
  templateCode: string;
  status: string;
}

interface WorkflowTaskPayload {
  workflowInstanceId: string;
  taskId?: string;
  taskIds?: string[];
  count?: number;
}

export function registerWorkflowListeners(): void {
  eventBus.on(APP_EVENTS.WORKFLOW_CREATED, (payload: WorkflowCreatedPayload) => {
    logger.info('Workflow created', payload);
  });

  eventBus.on(APP_EVENTS.TASK_CREATED, (payload: WorkflowTaskPayload) => {
    logger.info('Workflow tasks created', payload);
  });

  eventBus.on(APP_EVENTS.TASK_READY, (payload: WorkflowTaskPayload) => {
    logger.debug('Workflow task ready', payload);
  });

  eventBus.on(APP_EVENTS.TASK_COMPLETED, (payload: WorkflowTaskPayload) => {
    logger.info('Workflow task completed', payload);
  });

  eventBus.on(APP_EVENTS.WORKFLOW_COMPLETED, (payload: { workflowInstanceId: string }) => {
    logger.info('Workflow completed', payload);
  });

  eventBus.on(APP_EVENTS.WORKFLOW_CANCELLED, (payload: { workflowInstanceId: string }) => {
    logger.info('Workflow cancelled', payload);
  });
}
