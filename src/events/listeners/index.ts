import { registerOrderListeners } from './order.listeners.js';
import { registerWorkflowListeners } from './workflow.listeners.js';
import { registerProductionQueueListeners } from './production-queue.listeners.js';

export function registerEventListeners(): void {
  registerOrderListeners();
  registerWorkflowListeners();
  registerProductionQueueListeners();
}
