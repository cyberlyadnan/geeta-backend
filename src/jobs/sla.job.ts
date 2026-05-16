import { Worker, type Job } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { SlaJobData } from '../queues/sla.queue.js';
import { logger } from '../logs/logger.js';

async function processSlaCheck(job: Job<SlaJobData>): Promise<void> {
  const { workflowId, stepId, deadlineAt } = job.data;
  logger.info('Processing SLA check', { jobId: job.id, workflowId, stepId, deadlineAt });
  // TODO: Evaluate SLA breach, escalate workflow, notify stakeholders
}

export function createSlaWorker(): Worker<SlaJobData> {
  return new Worker<SlaJobData>(QUEUE_NAMES.SLA_MONITORING, processSlaCheck, {
    connection: bullmqConfig.connection,
    prefix: bullmqConfig.prefix,
    concurrency: 10,
  });
}
