import type { Request, Response } from 'express';
import { ApiResponse } from '../../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { queueService } from './queue.service.js';

export class QueueController {
  listDepartments = asyncHandler(async (req: Request, res: Response) => {
    const result = await queueService.listDepartments(req.user!.role, req.user!.permissions);
    return ApiResponse.success(res, result);
  });

  getDepartmentQueue = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as import('./queue.validation.js').DepartmentQueueQuery;
    const result = await queueService.getDepartmentQueue(
      req.params['departmentId'] as string,
      query,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.success(res, result);
  });

  getTaskDetail = asyncHandler(async (req: Request, res: Response) => {
    const result = await queueService.getTaskDetail(
      req.params['departmentId'] as string,
      req.params['taskId'] as string,
      req.user!.role,
      req.user!.permissions,
    );
    return ApiResponse.success(res, result);
  });
}

export const queueController = new QueueController();
