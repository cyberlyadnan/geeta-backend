import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { productionOrderService } from './production-order.service.js';

function actor(req: Request) {
  return { role: req.user!.role, permissions: req.user!.permissions };
}

export class ProductionOrderController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as import('./production-order.validation.js').ListProductionOrdersQuery;
    const result = await productionOrderService.list(query, role, permissions);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getById(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  workflow = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getWorkflow(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  tasks = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getTasks(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  timeline = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as import('./production-order.validation.js').TimelineQuery;
    const result = await productionOrderService.getTimeline(
      req.params['orderId'] as string,
      query,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  files = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getFiles(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  activity = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const query = req.validatedQuery as import('./production-order.validation.js').ActivityQuery;
    const result = await productionOrderService.getActivity(
      req.params['orderId'] as string,
      query,
      role,
      permissions,
    );
    return ApiResponse.success(res, result);
  });

  artwork = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getArtwork(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  qc = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getQc(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  machines = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getMachines(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  notes = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const result = await productionOrderService.getNotes(req.params['orderId'] as string, role, permissions);
    return ApiResponse.success(res, result);
  });

  jobCard = asyncHandler(async (req: Request, res: Response) => {
    const { role, permissions } = actor(req);
    const format = typeof req.query['format'] === 'string' ? req.query['format'] : undefined;
    const result = await productionOrderService.getJobCard(
      req.params['orderId'] as string,
      role,
      permissions,
      format,
    );

    if (result.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.buffer);
    }

    return ApiResponse.success(res, result.data);
  });
}

export const productionOrderController = new ProductionOrderController();
