import { env } from './env.js';
import { redis } from './redis.js';

export const bullmqConfig = {
  connection: redis,
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
