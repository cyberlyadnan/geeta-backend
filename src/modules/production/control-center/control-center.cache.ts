import { redisCache } from '../../../common/cache/redis-cache.js';
import {
  CONTROL_CENTER_ALERTS_KEY,
  CONTROL_CENTER_ALERTS_TTL_SEC,
  CONTROL_CENTER_CACHE_PREFIX,
  CONTROL_CENTER_DASHBOARD_KEY,
  CONTROL_CENTER_DASHBOARD_TTL_SEC,
  CONTROL_CENTER_TIMELINE_KEY,
  CONTROL_CENTER_TIMELINE_TTL_SEC,
} from './control-center.constants.js';

export class ControlCenterCache {
  getDashboard<T>(loader: () => Promise<T>): Promise<T> {
    return redisCache.getOrLoad(CONTROL_CENTER_DASHBOARD_KEY, CONTROL_CENTER_DASHBOARD_TTL_SEC, loader);
  }

  getTimeline<T>(limit: number, loader: () => Promise<T>): Promise<T> {
    const key = `${CONTROL_CENTER_TIMELINE_KEY}:${limit}`;
    return redisCache.getOrLoad(key, CONTROL_CENTER_TIMELINE_TTL_SEC, loader);
  }

  getAlerts<T>(limit: number, loader: () => Promise<T>): Promise<T> {
    const key = `${CONTROL_CENTER_ALERTS_KEY}:${limit}`;
    return redisCache.getOrLoad(key, CONTROL_CENTER_ALERTS_TTL_SEC, loader);
  }

  async invalidateAll(): Promise<void> {
    await redisCache.delByPrefix(CONTROL_CENTER_CACHE_PREFIX);
  }
}

export const controlCenterCache = new ControlCenterCache();
