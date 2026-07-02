import { redisCache } from '../../../common/cache/redis-cache.js';
import { PRODUCTION_ORDER_CACHE_PREFIX } from './production-order.constants.js';

export class ProductionOrderCache {
  async invalidateAll(): Promise<void> {
    await redisCache.delByPrefix(PRODUCTION_ORDER_CACHE_PREFIX);
  }
}

export const productionOrderCache = new ProductionOrderCache();
