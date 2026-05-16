import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { purchasesService } from './purchases.service.js';

export class PurchasesController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await purchasesService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await purchasesService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const purchasesController = new PurchasesController();
