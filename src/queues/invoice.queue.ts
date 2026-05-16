import { QUEUE_NAMES } from '../constants/queueNames.js';
import { getQueue } from './queue.factory.js';

export const invoiceQueue = getQueue(QUEUE_NAMES.INVOICE_GENERATION);

export interface InvoiceJobData {
  orderId: string;
  userId: string;
}

export async function enqueueInvoiceGeneration(data: InvoiceJobData): Promise<void> {
  await invoiceQueue.add('generate-invoice', data);
}
