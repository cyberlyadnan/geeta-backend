import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { dashboardService } from './dashboard.service.js';

export class DashboardController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await dashboardService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await dashboardService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const dashboardController = new DashboardController();
