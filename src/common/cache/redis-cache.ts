import { getRedis, isRedisConnected } from '../../config/redis.js';
import { logger } from '../../logs/logger.js';

export interface CacheStats {
  redisHits: number;
  redisMisses: number;
}

let globalRedisHits = 0;
let globalRedisMisses = 0;

export function recordRedisCacheHit(): void {
  globalRedisHits += 1;
}

export function recordRedisCacheMiss(): void {
  globalRedisMisses += 1;
}

export function getGlobalRedisCacheStats(): CacheStats {
  return { redisHits: globalRedisHits, redisMisses: globalRedisMisses };
}

/**
 * Distributed Redis cache with JSON serialization.
 * Falls back to loader when Redis is unavailable.
 */
export class RedisCache {
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisConnected()) return null;
    try {
      const raw = await getRedis().get(key);
      if (raw === null) return null;
      recordRedisCacheHit();
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.debug('Redis cache get failed', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!isRedisConnected()) return;
    try {
      await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.debug('Redis cache set failed', {
        key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getOrLoad<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    recordRedisCacheMiss();
    const value = await loader();
    void this.set(key, value, ttlSeconds);
    return value;
  }

  async del(key: string): Promise<void> {
    if (!isRedisConnected()) return;
    try {
      await getRedis().del(key);
    } catch {
      // non-critical
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (!isRedisConnected()) return;
    try {
      const redis = getRedis();
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    } catch {
      // non-critical
    }
  }
}

export const redisCache = new RedisCache();
