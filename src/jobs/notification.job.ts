import { Worker, type Job } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { NotificationJobData } from '../queues/notification.queue.js';
import { logger } from '../logs/logger.js';

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { userId, title, body, type } = job.data;
  logger.info('Processing notification job', { jobId: job.id, userId, type, title, body });
  // TODO: Persist notification + emit via Socket.io
}

export function createNotificationWorker(): Worker<NotificationJobData> {
  return new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotification,
    {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
      concurrency: 5,
    },
  );
}
