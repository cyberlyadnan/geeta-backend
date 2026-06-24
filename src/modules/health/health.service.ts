import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { isRedisConnected, isRedisEnabled } from '../../config/redis.js';
import { metricsStore } from '../../observability/metrics-store.js';
import type { SystemHealthStatus } from '../../observability/types.js';

type HealthCheckStatus = 'up' | 'down' | 'degraded' | 'disabled';

export interface HealthComponent {
  status: HealthCheckStatus;
  latencyMs?: number;
  message?: string;
}

function isStorageConfigured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME,
  );
}

export const healthService = {
  async checkDatabase(): Promise<HealthComponent> {
    const start = performance.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Math.round(performance.now() - start);
      const status: HealthCheckStatus = latencyMs > 500 ? 'degraded' : 'up';
      return { status, latencyMs };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Database unreachable',
      };
    }
  },

  checkRedis(): HealthComponent {
    if (!isRedisEnabled()) {
      return { status: 'disabled', message: 'Redis is disabled (REDIS_ENABLED=false)' };
    }
    if (isRedisConnected()) {
      return { status: 'up' };
    }
    return { status: 'down', message: 'Redis is enabled but not connected' };
  },

  checkStorage(): HealthComponent {
    if (!isStorageConfigured()) {
      return {
        status: 'disabled',
        message: 'R2 storage credentials not configured',
      };
    }
    return {
      status: 'up',
      message: `Bucket: ${env.R2_BUCKET_NAME}`,
    };
  },

  async getOverallHealth(): Promise<{
    status: SystemHealthStatus;
    uptimeSeconds: number;
    version: string;
    components: {
      api: HealthComponent;
      database: HealthComponent;
      redis: HealthComponent;
      storage: HealthComponent;
    };
    metrics: ReturnType<typeof metricsStore.getPerformanceMetrics>;
  }> {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      Promise.resolve(this.checkRedis()),
      Promise.resolve(this.checkStorage()),
    ]);

    const api: HealthComponent = { status: 'up' };
    const metrics = metricsStore.getPerformanceMetrics();

    let status: SystemHealthStatus = 'healthy';
    if (
      database.status === 'degraded' ||
      redis.status === 'degraded' ||
      metrics.systemHealth === 'degraded'
    ) {
      status = 'degraded';
    }
    if (
      database.status === 'down' ||
      redis.status === 'down' ||
      metrics.systemHealth === 'critical'
    ) {
      status = 'critical';
    }

    return {
      status,
      uptimeSeconds: metrics.uptimeSeconds,
      version: env.API_VERSION,
      components: { api, database, redis, storage },
      metrics,
    };
  },
};
