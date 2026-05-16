import { Queue } from 'bullmq';
import { bullmqConfig, assertRedisForQueues } from '../config/bullmq.js';
import { isRedisConnected } from '../config/redis.js';
import type { QueueName } from '../constants/queueNames.js';
import { logger } from '../logs/logger.js';

const queueRegistry = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue | null {
  if (!isRedisConnected()) {
    return null;
  }

  let queue = queueRegistry.get(name);

  if (!queue) {
    assertRedisForQueues();
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
  if (queueRegistry.size === 0) return;
  await Promise.all([...queueRegistry.values()].map((q) => q.close()));
  queueRegistry.clear();
  logger.debug('All BullMQ queues closed');
}
