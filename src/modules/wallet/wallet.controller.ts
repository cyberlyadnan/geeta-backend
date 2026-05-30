import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { walletService } from './wallet.service.js';
import type { AddMoneyInput, ListTransactionsQuery } from './wallet.validation.js';

export class WalletController {
  getWallet = asyncHandler(async (req: Request, res: Response) => {
    const wallet = await walletService.getWallet(req.user!.id);
    return ApiResponse.success(res, wallet);
  });

  getSummary = asyncHandler(async (req: Request, res: Response) => {
    const summary = await walletService.getSummary(req.user!.id);
    return ApiResponse.success(res, summary);
  });

  getRechargeLimits = asyncHandler(async (_req: Request, res: Response) => {
    const limits = walletService.getRechargeLimits();
    return ApiResponse.success(res, limits);
  });

  listTransactions = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListTransactionsQuery;
    const result = await walletService.listTransactions(req.user!.id, query);
    return ApiResponse.success(res, result);
  });

  addMoney = asyncHandler(async (req: Request, res: Response) => {
    const result = await walletService.addMoney(req.user!.id, req.body as AddMoneyInput);
    return ApiResponse.created(res, result, 'Scan QR to complete payment');
  });
}

export const walletController = new WalletController();
