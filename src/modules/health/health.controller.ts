import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { healthService } from './health.service.js';

export const healthController = {
  async overall(_req: Request, res: Response): Promise<void> {
    const health = await healthService.getOverallHealth();
    const httpStatus =
      health.status === 'healthy'
        ? StatusCodes.OK
        : health.status === 'degraded'
          ? StatusCodes.OK
          : StatusCodes.SERVICE_UNAVAILABLE;

    res.status(httpStatus).json({
      success: health.status !== 'critical',
      status: health.status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: health.uptimeSeconds,
      version: health.version,
      components: health.components,
      metrics: health.metrics,
    });
  },

  async database(_req: Request, res: Response): Promise<void> {
    const database = await healthService.checkDatabase();
    res.status(database.status === 'down' ? StatusCodes.SERVICE_UNAVAILABLE : StatusCodes.OK).json({
      success: database.status !== 'down',
      component: 'database',
      ...database,
      timestamp: new Date().toISOString(),
    });
  },

  async redis(_req: Request, res: Response): Promise<void> {
    const redis = healthService.checkRedis();
    res.status(redis.status === 'down' ? StatusCodes.SERVICE_UNAVAILABLE : StatusCodes.OK).json({
      success: redis.status !== 'down',
      component: 'redis',
      ...redis,
      timestamp: new Date().toISOString(),
    });
  },

  async storage(_req: Request, res: Response): Promise<void> {
    const storage = healthService.checkStorage();
    res.status(StatusCodes.OK).json({
      success: storage.status !== 'down',
      component: 'storage',
      ...storage,
      timestamp: new Date().toISOString(),
    });
  },
};
