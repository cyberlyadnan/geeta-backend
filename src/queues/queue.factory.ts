import { Queue } from 'bullmq';
import { bullmqConfig } from '../config/bullmq.js';
import type { QueueName } from '../constants/queueNames.js';

const queueRegistry = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let queue = queueRegistry.get(name);

  if (!queue) {
    queue = new Queue(name, {
      connection: bullmqConfig.connection,
      prefix: bullmqConfig.prefix,
      defaultJobOptions: bullmqConfig.defaultJobOptions,
    });
    queueRegistry.set(name, queue);
  }

  return queue;
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queueRegistry.values()].map((q) => q.close()));
  queueRegistry.clear();
}
