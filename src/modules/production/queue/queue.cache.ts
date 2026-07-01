import { createHash } from 'node:crypto';
import { redisCache } from '../../../common/cache/redis-cache.js';
import {
  QUEUE_CACHE_PREFIX,
  QUEUE_DEPARTMENTS_CACHE_KEY,
  QUEUE_DEPARTMENTS_TTL_SEC,
  QUEUE_LIST_TTL_SEC,
} from './queue.constants.js';

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export class ProductionQueueCache {
  async getDepartments<T>(loader: () => Promise<T>): Promise<T> {
    return redisCache.getOrLoad(QUEUE_DEPARTMENTS_CACHE_KEY, QUEUE_DEPARTMENTS_TTL_SEC, loader);
  }

  async getDepartmentQueue<T>(
    departmentId: string,
    queryKey: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const key = `${QUEUE_CACHE_PREFIX}dept:${departmentId}:${hashKey(queryKey)}`;
    return redisCache.getOrLoad(key, QUEUE_LIST_TTL_SEC, loader);
  }

  async invalidateAll(): Promise<void> {
    await redisCache.delByPrefix(QUEUE_CACHE_PREFIX);
  }

  async invalidateDepartment(departmentId: string): Promise<void> {
    await redisCache.delByPrefix(`${QUEUE_CACHE_PREFIX}dept:${departmentId}:`);
    await redisCache.del(QUEUE_DEPARTMENTS_CACHE_KEY);
  }
}

export const productionQueueCache = new ProductionQueueCache();
