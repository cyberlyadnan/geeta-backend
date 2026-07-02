import { getGlobalRedisCacheStats } from '../../common/cache/redis-cache.js';
import { adminMonitoringService } from '../admin-monitoring/admin-monitoring.service.js';
import { healthService } from '../health/health.service.js';
import { prisma } from '../../config/database.js';

export class SystemHealthService {
  async getUnifiedHealth() {
    const [monitoring, database, redis, storage, tableCounts] = await Promise.all([
      adminMonitoringService.getDashboard({ refresh: true }),
      healthService.checkDatabase(),
      healthService.checkRedis(),
      healthService.checkStorage(),
      Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.productionOrder.count(),
        prisma.workflowInstance.count({ where: { status: { in: ['RUNNING', 'INITIALIZED', 'IN_PROGRESS'] } } }),
        prisma.workflowTask.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'SKIPPED'] } } }),
      ]),
    ]);

    const redisCache = getGlobalRedisCacheStats();

    return {
      status: database.status === 'up' && redis.status !== 'down' ? 'healthy' : 'degraded',
      database,
      redis: { ...redis, cache: redisCache },
      storage,
      api: {
        performance: monitoring.performance,
        recentErrors: monitoring.recentErrors.slice(0, 10),
        slowApiThresholdMs: monitoring.slowApiThresholdMs,
      },
      workers: {
        note: 'BullMQ worker health is environment-specific; verify worker process separately.',
        queueStats: null,
      },
      operational: {
        users: tableCounts[0],
        productionOrders: tableCounts[1],
        activeWorkflows: tableCounts[2],
        openTasks: tableCounts[3],
      },
      memory: {
        heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10,
        rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      },
      cachedAt: new Date().toISOString(),
    };
  }
}

export const systemHealthService = new SystemHealthService();
