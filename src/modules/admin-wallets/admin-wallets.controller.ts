import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminWalletsService } from './admin-wallets.service.js';
import type { AdminWalletAdjustInput, ListAdminWalletsQuery } from './admin-wallets.validation.js';

export class AdminWalletsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListAdminWalletsQuery;
    const result = await adminWalletsService.list(query);
    return ApiResponse.success(res, result);
  });

  getByUserId = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.validatedParams as { userId: string };
    const result = await adminWalletsService.getByUserId(userId);
    return ApiResponse.success(res, result);
  });

  credit = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminWalletsService.credit(req.body as AdminWalletAdjustInput, req.user!.id);
    return ApiResponse.success(res, result, 'Wallet credited');
  });

  debit = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminWalletsService.debit(req.body as AdminWalletAdjustInput, req.user!.id);
    return ApiResponse.success(res, result, 'Wallet debited');
  });
}

export const adminWalletsController = new AdminWalletsController();
