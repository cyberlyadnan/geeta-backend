import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { walletService } from './wallet.service.js';

export class WalletController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await walletService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await walletService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const walletController = new WalletController();
