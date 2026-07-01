import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { workflowService } from './workflow.service.js';

export class WorkflowController {
  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await workflowService.getById(
      req.params['id'] as string,
      req.user?.id,
      req.user?.role,
    );
    return ApiResponse.success(res, result);
  });

  getByOrderId = asyncHandler(async (req: Request, res: Response) => {
    const result = await workflowService.getByOrderId(
      req.params['orderId'] as string,
      req.user?.id,
      req.user?.role,
    );
    return ApiResponse.success(res, result);
  });

  getTasks = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { cursor?: string; limit: number };
    const result = await workflowService.getTasks(req.params['id'] as string, query);
    return ApiResponse.success(res, result);
  });

  getTimeline = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as { cursor?: string; limit: number };
    const result = await workflowService.getTimeline(req.params['id'] as string, query);
    return ApiResponse.success(res, result);
  });

  advance = asyncHandler(async (req: Request, res: Response) => {
    const result = await workflowService.advance(
      req.params['id'] as string,
      req.body,
      req.user?.id,
    );
    return ApiResponse.success(res, result);
  });
}

export const workflowController = new WorkflowController();
