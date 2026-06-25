import { Worker, type Job } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { ActivityLogJobData } from '../queues/activity-log.queue.js';
import { activityLogService } from '../services/activity/activity-log.service.js';
import { logger } from '../logs/logger.js';

async function processActivityLog(job: Job<ActivityLogJobData>): Promise<void> {
  await activityLogService.log(job.data);
}

export function createActivityLogWorker(): Worker<ActivityLogJobData> {
  const worker = new Worker<ActivityLogJobData>(
    QUEUE_NAMES.ACTIVITY_LOGS,
    processActivityLog,
    {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    logger.warn('Activity log job failed', {
      jobId: job?.id,
      action: job?.data.action,
      message: err.message,
    });
  });

  return worker;
}
