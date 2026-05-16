import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ordersService } from './orders.service.js';

export class OrdersController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await ordersService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await ordersService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const ordersController = new OrdersController();
