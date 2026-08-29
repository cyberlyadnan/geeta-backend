import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cashBankService } from './cash-bank.service.js';
import type {
  BankTransactionListQuery,
  CreateBankTransactionInput,
  CreateCashBankAccountInput,
  ReconcileInput,
  UpdateCashBankAccountInput,
} from './cash-bank.validation.js';

export class CashBankController {
  listAccounts = asyncHandler(async (req: Request, res: Response) => {
    const includeInactive = req.query['includeInactive'] === 'true';
    return ApiResponse.success(res, await cashBankService.listAccounts(includeInactive));
  });

  createAccount = asyncHandler(async (req: Request, res: Response) => {
    const result = await cashBankService.createAccount(req.body as CreateCashBankAccountInput, req.user!.id);
    return ApiResponse.created(res, result, 'Account created');
  });

  updateAccount = asyncHandler(async (req: Request, res: Response) => {
    const result = await cashBankService.updateAccount(
      req.params['id'] as string,
      req.body as UpdateCashBankAccountInput,
    );
    return ApiResponse.success(res, result, 'Account updated');
  });

  listTransactions = asyncHandler(async (req: Request, res: Response) => {
    const result = await cashBankService.listTransactions(req.validatedQuery as BankTransactionListQuery);
    return ApiResponse.success(res, result, 'Transactions', 200, result.meta);
  });

  createTransaction = asyncHandler(async (req: Request, res: Response) => {
    const result = await cashBankService.createTransaction(
      req.body as CreateBankTransactionInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Transaction recorded');
  });

  reconcile = asyncHandler(async (req: Request, res: Response) => {
    const result = await cashBankService.reconcile(
      req.params['id'] as string,
      req.body as ReconcileInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Reconciliation saved');
  });

  listReconciliations = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await cashBankService.listReconciliations(req.params['id'] as string));
  });
}

export const cashBankController = new CashBankController();
