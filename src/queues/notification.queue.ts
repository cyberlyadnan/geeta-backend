import { QUEUE_NAMES } from '../constants/queueNames.js';
import { getQueue } from './queue.factory.js';

export const notificationQueue = getQueue(QUEUE_NAMES.NOTIFICATIONS);

export interface NotificationJobData {
  userId: string;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export async function enqueueNotification(data: NotificationJobData): Promise<void> {
  await notificationQueue.add('send-notification', data, {
    priority: data.type === 'urgent' ? 1 : 5,
  });
}
