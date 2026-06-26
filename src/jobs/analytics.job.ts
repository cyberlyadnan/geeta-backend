import { Worker, type Job } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { AnalyticsJobData } from '../queues/analytics.queue.js';
import { performanceLogger } from '../logs/performance-logger.js';
import { logger } from '../logs/logger.js';

async function processAnalytics(job: Job<AnalyticsJobData>): Promise<void> {
  performanceLogger.info('analytics_event', {
    event: job.data.event,
    userId: job.data.userId,
    vendorProfileId: job.data.vendorProfileId,
    metadata: job.data.metadata,
    occurredAt: job.data.occurredAt ?? new Date().toISOString(),
  });
}

export function createAnalyticsWorker(): Worker<AnalyticsJobData> {
  const worker = new Worker<AnalyticsJobData>(
    QUEUE_NAMES.ANALYTICS,
    processAnalytics,
    {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
      concurrency: 20,
    },
  );

  worker.on('failed', (job, err) => {
    logger.warn('Analytics job failed', {
      jobId: job?.id,
      event: job?.data.event,
      message: err.message,
    });
  });

  return worker;
}
