import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { expensesService } from './expenses.service.js';

export class ExpensesController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await expensesService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await expensesService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const expensesController = new ExpensesController();
