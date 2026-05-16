import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { productsService } from './products.service.js';

export class ProductsController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await productsService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await productsService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const productsController = new ProductsController();
