import { registerOrderListeners } from './order.listeners.js';
import { registerWorkflowListeners } from './workflow.listeners.js';
import { registerProductionQueueListeners } from './production-queue.listeners.js';
import { registerAssignmentListeners } from './assignment.listeners.js';
import { registerAssignmentNotificationListeners } from './assignment-notification.listeners.js';

export function registerEventListeners(): void {
  registerOrderListeners();
  registerWorkflowListeners();
  registerProductionQueueListeners();
  registerAssignmentListeners();
  registerAssignmentNotificationListeners();
}
