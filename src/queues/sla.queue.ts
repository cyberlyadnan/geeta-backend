import { QUEUE_NAMES } from '../constants/queueNames.js';
import { getQueue } from './queue.factory.js';

export const slaQueue = getQueue(QUEUE_NAMES.SLA_MONITORING);

export interface SlaJobData {
  workflowId: string;
  stepId: string;
  deadlineAt: string;
}

export async function enqueueSlaCheck(data: SlaJobData, delayMs?: number): Promise<void> {
  await slaQueue.add('check-sla', data, { delay: delayMs });
}
