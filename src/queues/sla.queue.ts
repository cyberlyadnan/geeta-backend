import { QUEUE_NAMES } from '../constants/queueNames.js';
import { logger } from '../logs/logger.js';
import { getQueue } from './queue.factory.js';

export interface SlaJobData {
  workflowId: string;
  stepId: string;
  deadlineAt: string;
}

export async function enqueueSlaCheck(data: SlaJobData, delayMs?: number): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.SLA_MONITORING);
  if (!queue) {
    logger.debug('SLA job skipped (Redis unavailable)', { workflowId: data.workflowId });
    return;
  }
  await queue.add('check-sla', data, { delay: delayMs });
}
