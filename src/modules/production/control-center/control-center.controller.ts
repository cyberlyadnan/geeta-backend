import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { controlCenterService } from './control-center.service.js';

function actor(req: Request) {
  return { role: req.user!.role, permissions: req.user!.permissions };
}

export class ControlCenterController {
  dashboard = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await controlCenterService.getDashboard(role, permissions);
    return ApiResponse.success(res, result);
  });

  overview = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await controlCenterService.getOverview(role, permissions);
    return ApiResponse.success(res, result);
  });

  departments = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await controlCenterService.getDepartments(role, permissions);
    return ApiResponse.success(res, result);
  });

  kpis = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await controlCenterService.getKpis(role, permissions);
    return ApiResponse.success(res, result);
  });

  heatmap = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await controlCenterService.getHeatmap(role, permissions);
    return ApiResponse.success(res, result);
  });

  timeline = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as import('./control-center.validation.js').TimelineQuery;
    const result = await controlCenterService.getTimeline(role, permissions, query);
    return ApiResponse.success(res, result);
  });

  alerts = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as import('./control-center.validation.js').AlertsQuery;
    const result = await controlCenterService.getAlerts(role, permissions, query);
    return ApiResponse.success(res, result);
  });

  orderDrillDown = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await controlCenterService.getOrderDrillDown(
      req.params['orderId'] as string,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });
}

export const controlCenterController = new ControlCenterController();
