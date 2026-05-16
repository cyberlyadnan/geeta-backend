import { Worker, type Job } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import { QUEUE_NAMES } from '../constants/queueNames.js';
import type { InvoiceJobData } from '../queues/invoice.queue.js';
import { logger } from '../logs/logger.js';

async function processInvoice(job: Job<InvoiceJobData>): Promise<void> {
  const { orderId, userId } = job.data;
  logger.info('Processing invoice generation', { jobId: job.id, orderId, userId });
  // TODO: Generate PDF invoice, store file reference
}

export function createInvoiceWorker(): Worker<InvoiceJobData> {
  return new Worker<InvoiceJobData>(QUEUE_NAMES.INVOICE_GENERATION, processInvoice, {
    connection: bullmqConfig.connection,
    prefix: bullmqConfig.prefix,
    concurrency: 3,
  });
}
