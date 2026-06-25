import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ordersService } from './orders.service.js';

export class OrdersController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as import('./orders.validation.js').ListOrdersQuery;
    const result = await ordersService.findAll(req.user!.id, query.page, query.limit);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await ordersService.findById(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await ordersService.create(req.user!.id, req.body);
    return ApiResponse.created(res, result, 'Order placed successfully');
  });
}

export const ordersController = new OrdersController();
