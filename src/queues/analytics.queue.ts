import { getQueue } from './queue.factory.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';

export interface AnalyticsJobData {
  event: string;
  userId?: string;
  vendorProfileId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

/** Non-blocking analytics — dashboards, funnels, future materialized summaries */
export async function enqueueAnalytics(data: AnalyticsJobData): Promise<boolean> {
  const queue = getQueue(QUEUE_NAMES.ANALYTICS);
  if (!queue) return false;

  await queue.add('analytics-event', data, {
    removeOnComplete: 10_000,
    removeOnFail: 2000,
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
    priority: 10,
  });
  return true;
}
