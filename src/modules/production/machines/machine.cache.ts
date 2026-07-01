import { redisCache } from '../../../common/cache/redis-cache.js';
import { MACHINE_CACHE_PREFIX } from './machine.constants.js';

export class MachineCache {
  async invalidateAll(): Promise<void> {
    await redisCache.delByPrefix(MACHINE_CACHE_PREFIX);
  }
}

export const machineCache = new MachineCache();
