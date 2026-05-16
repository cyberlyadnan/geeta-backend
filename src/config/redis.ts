import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../logs/logger.js';

let redisClient: Redis | null = null;

export function createRedisClient(): Redis {
  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export const redis: Redis = (redisClient ??= createRedisClient());

export async function connectRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    redis.once('ready', () => {
      logger.info('Redis connected');
      resolve();
    });
    redis.once('error', (err: Error) => {
      logger.error('Redis connection error', { error: err.message });
      reject(err);
    });
  });
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}
