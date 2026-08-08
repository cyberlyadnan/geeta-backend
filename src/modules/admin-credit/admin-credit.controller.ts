import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminCreditService } from './admin-credit.service.js';
import type {
  ListCreditAccountsQuery,
  ListCreditTransactionsQuery,
  ListFinancialEventsQuery,
  RecordRepaymentInput,
  SetCreditLimitInput,
} from './admin-credit.validation.js';

export class AdminCreditController {
  setVendorCreditLimit = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCreditService.setVendorCreditLimit(id, req.body as SetCreditLimitInput);
    return ApiResponse.success(res, result, 'Credit limit updated');
  });

  setRetailCustomerCreditLimit = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCreditService.setRetailCustomerCreditLimit(
      id,
      req.body as SetCreditLimitInput,
    );
    return ApiResponse.success(res, result, 'Credit limit updated');
  });

  /** All credit accounts with actor names — the Udhar screen's list. */
  listAccounts = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListCreditAccountsQuery;
    const result = await adminCreditService.listAccounts(query);
    return ApiResponse.success(res, result);
  });

  recordRepayment = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminCreditService.recordRepayment(
      id,
      req.body as RecordRepaymentInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Repayment recorded');
  });

  listTransactions = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const query = req.validatedQuery as ListCreditTransactionsQuery;
    const result = await adminCreditService.listTransactions(id, query);
    return ApiResponse.success(res, result);
  });

  listFinancialEvents = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListFinancialEventsQuery;
    const result = await adminCreditService.listFinancialEvents(query);
    return ApiResponse.success(res, result);
  });
}

export const adminCreditController = new AdminCreditController();
