import { metricsStore } from '../../observability/metrics-store.js';
import { healthService } from '../health/health.service.js';
import { TtlCache } from '../../common/cache/ttl-cache.js';
import type { SystemHealthStatus } from '../../observability/types.js';

function databaseHealthStatus(
  db: Awaited<ReturnType<typeof healthService.checkDatabase>>,
): SystemHealthStatus {
  if (db.status === 'down') return 'critical';
  if (db.status === 'degraded') return 'degraded';
  return 'healthy';
}

const dashboardCache = new TtlCache<Awaited<ReturnType<typeof buildDashboard>>>(
  Number(process.env['MONITORING_DASHBOARD_CACHE_TTL_MS'] ?? 5_000),
);

async function buildDashboard() {
  const databaseHealth = await healthService.checkDatabase();
  const performance = metricsStore.getPerformanceMetrics();
  const endpoints = metricsStore.getEndpointMetrics();
  const slowRequests = metricsStore.getSlowRequests(20);
  const errors = metricsStore.getErrors(20);
  const database = metricsStore.getDatabaseMetrics(databaseHealthStatus(databaseHealth));

  return {
    performance,
    database,
    databaseHealth,
    redisHealth: healthService.checkRedis(),
    storageHealth: healthService.checkStorage(),
    topSlowEndpoints: endpoints.slice(0, 10),
    recentSlowRequests: slowRequests,
    recentErrors: errors,
    slowApiThresholdMs: metricsStore.getSlowApiThreshold(),
    cachedAt: new Date().toISOString(),
  };
}

export const adminMonitoringService = {
  async getDashboard(options?: { refresh?: boolean }) {
    if (options?.refresh) {
      dashboardCache.invalidate();
    }
    return dashboardCache.getOrLoad(buildDashboard);
  },

  getEndpoints() {
    return metricsStore.getEndpointMetrics();
  },

  getSlowRequests(limit = 50) {
    return metricsStore.getSlowRequests(limit);
  },

  getErrors(limit = 50) {
    return metricsStore.getErrors(limit);
  },

  getDatabaseMetrics() {
    return metricsStore.getDatabaseMetrics();
  },

  getRequestTimeline(requestId: string) {
    return metricsStore.getRequestTimeline(requestId);
  },

  getRecentRequests(limit = 50) {
    return metricsStore.getRecentRequests(limit);
  },
};
