import { QUEUE_NAMES } from '../constants/queueNames.js';
import { logger } from '../logs/logger.js';
import { getQueue } from './queue.factory.js';

export interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export async function enqueueNotification(data: NotificationJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
  if (!queue) {
    logger.debug('Notification skipped (Redis unavailable)', { userId: data.userId });
    return;
  }
  await queue.add('send-notification', data, {
    priority: data.type === 'urgent' ? 1 : 5,
  });
}
