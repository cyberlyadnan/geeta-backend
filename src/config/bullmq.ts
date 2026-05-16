import { env } from './env.js';
import { getRedis, isRedisConnected } from './redis.js';

export const bullmqConfig = {
  get connection() {
    return getRedis();
  },
  prefix: env.BULLMQ_PREFIX,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
} as const;

export function assertRedisForQueues(): void {
  if (!isRedisConnected()) {
    throw new Error('Redis is required for background jobs. Connect Redis or run workers separately.');
  }
}
