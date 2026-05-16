import { Redis, type RedisOptions } from 'ioredis';
import { env } from './env.js';
import { logger } from '../logs/logger.js';

let redisClient: Redis | null = null;
let redisConnected = false;

const CONNECT_TIMEOUT_MS = 5_000;

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

export function isRedisEnabled(): boolean {
  return env.REDIS_ENABLED;
}

/** When true, API starts even if Redis is down (default: true in development) */
export function isRedisOptional(): boolean {
  const fromEnv = process.env['REDIS_OPTIONAL'];
  if (fromEnv !== undefined) {
    return parseBool(fromEnv, false);
  }
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

export function isRedisConnected(): boolean {
  return redisConnected && redisClient !== null;
}

function buildRedisOptions(): RedisOptions | string {
  if (env.REDIS_URL) {
    return env.REDIS_URL;
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy: (times: number) => (times > 2 ? null : Math.min(times * 200, 1000)),
  };
}

export function createRedisClient(): Redis {
  const options = buildRedisOptions();
  return typeof options === 'string' ? new Redis(options) : new Redis(options);
}

/** Returns the active Redis client; throws if Redis is not connected */
export function getRedis(): Redis {
  if (!redisClient || !redisConnected) {
    throw new Error('Redis is not connected. Set REDIS_ENABLED=true and ensure Redis is running.');
  }
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  if (!isRedisEnabled()) {
    logger.warn('Redis disabled (REDIS_ENABLED=false). Background jobs and queues are off.');
    return;
  }

  const client = createRedisClient();

  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Redis connection timed out after ${CONNECT_TIMEOUT_MS}ms`));
        }, CONNECT_TIMEOUT_MS);
      }),
    ]);

    redisClient = client;
    redisConnected = true;
    logger.info('Redis connected', {
      host: env.REDIS_URL ? 'from REDIS_URL' : env.REDIS_HOST,
      port: env.REDIS_URL ? undefined : env.REDIS_PORT,
    });
  } catch (error) {
    await client.quit().catch(() => undefined);

    const message = error instanceof Error ? error.message : String(error);
    const hint =
      'Start Redis locally (Docker: docker run -d -p 6379:6379 redis:alpine) or set REDIS_URL to a cloud provider (Upstash). For local API-only dev, set REDIS_OPTIONAL=true or REDIS_ENABLED=false in .env';

    if (isRedisOptional()) {
      logger.warn('Redis unavailable — continuing without Redis', { message, hint });
      redisConnected = false;
      redisClient = null;
      return;
    }

    logger.error('Redis connection failed', { message, hint });
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisConnected = false;
    logger.info('Redis disconnected');
  }
}
