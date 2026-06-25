import { getQueue } from './queue.factory.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { LogActivityInput } from '../services/activity/activity-log.service.js';

export type ActivityLogJobData = LogActivityInput;

export async function enqueueActivityLog(data: ActivityLogJobData): Promise<boolean> {
  const queue = getQueue(QUEUE_NAMES.ACTIVITY_LOGS);
  if (!queue) return false;

  await queue.add('activity-log', data, {
    removeOnComplete: 5000,
    removeOnFail: 1000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
  return true;
}
