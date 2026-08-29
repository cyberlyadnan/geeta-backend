import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { reportsService } from './reports.service.js';
import type {
  CollectionsQuery,
  ExpenseSummaryQuery,
  SalesRegisterQuery,
} from './reports.validation.js';

export class ReportsController {
  salesRegister = asyncHandler(async (req: Request, res: Response) => {
    const result = await reportsService.salesRegister(req.validatedQuery as SalesRegisterQuery);
    return ApiResponse.success(res, result, 'Sales register', 200, result.meta);
  });

  collections = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await reportsService.collections(req.validatedQuery as CollectionsQuery));
  });

  expenseSummary = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await reportsService.expenseSummary(req.validatedQuery as ExpenseSummaryQuery));
  });
}

export const reportsController = new ReportsController();
