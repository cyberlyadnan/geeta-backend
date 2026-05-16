import { QUEUE_NAMES } from '../constants/queueNames.js';
import { logger } from '../logs/logger.js';
import { getQueue } from './queue.factory.js';

export interface InvoiceJobData {
  orderId: string;
  userId: string;
}

export async function enqueueInvoiceGeneration(data: InvoiceJobData): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.INVOICE_GENERATION);
  if (!queue) {
    logger.debug('Invoice job skipped (Redis unavailable)', { orderId: data.orderId });
    return;
  }
  await queue.add('generate-invoice', data);
}
