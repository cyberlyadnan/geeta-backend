import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminOrdersService } from './admin-orders.service.js';
import type { AdminCreateOrderInput, AdminOrderPreviewInput } from './admin-orders.validation.js';

export class AdminOrdersController {
  preview = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminOrdersService.preview(req.user!.id, req.body as AdminOrderPreviewInput);
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminOrdersService.create(req.user!.id, req.body as AdminCreateOrderInput);
    return ApiResponse.created(res, result, 'Order placed successfully');
  });
}

export const adminOrdersController = new AdminOrdersController();
