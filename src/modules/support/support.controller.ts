import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { supportService } from './support.service.js';

export class SupportController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await supportService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await supportService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const supportController = new SupportController();
