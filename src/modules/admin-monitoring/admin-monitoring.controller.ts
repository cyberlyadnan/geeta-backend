import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { adminMonitoringService } from './admin-monitoring.service.js';

export const adminMonitoringController = {
  async dashboard(_req: Request, res: Response): Promise<void> {
    const data = await adminMonitoringService.getDashboard();
    res.status(StatusCodes.OK).json({ success: true, data });
  },

  endpoints(_req: Request, res: Response): void {
    res.status(StatusCodes.OK).json({
      success: true,
      data: adminMonitoringService.getEndpoints(),
    });
  },

  slowRequests(req: Request, res: Response): void {
    const limit = Number(req.query['limit'] ?? 50);
    res.status(StatusCodes.OK).json({
      success: true,
      data: adminMonitoringService.getSlowRequests(limit),
    });
  },

  errors(req: Request, res: Response): void {
    const limit = Number(req.query['limit'] ?? 50);
    res.status(StatusCodes.OK).json({
      success: true,
      data: adminMonitoringService.getErrors(limit),
    });
  },

  database(_req: Request, res: Response): void {
    res.status(StatusCodes.OK).json({
      success: true,
      data: adminMonitoringService.getDatabaseMetrics(),
    });
  },

  timeline(req: Request, res: Response): void {
    const requestId = String(req.params['requestId']);
    const timeline = adminMonitoringService.getRequestTimeline(requestId);
    if (!timeline) {
      res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Request timeline not found',
      });
      return;
    }
    res.status(StatusCodes.OK).json({ success: true, data: timeline });
  },

  recentRequests(req: Request, res: Response): void {
    const limit = Number(req.query['limit'] ?? 50);
    res.status(StatusCodes.OK).json({
      success: true,
      data: adminMonitoringService.getRecentRequests(limit),
    });
  },
};
