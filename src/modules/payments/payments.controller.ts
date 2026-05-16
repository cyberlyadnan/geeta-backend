import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paymentsService } from './payments.service.js';

export class PaymentsController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await paymentsService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentsService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const paymentsController = new PaymentsController();
