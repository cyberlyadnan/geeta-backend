import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminFinanceReportsService } from './admin-finance-reports.service.js';
import type {
  AgeingQuery,
  BalanceSheetQuery,
  ExportQuery,
  PartyStatementQuery,
  ProfitLossQuery,
  ReportRange,
  TrialBalanceQuery,
} from './admin-finance-reports.validation.js';

export class AdminFinanceReportsController {
  dashboard = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.dashboard(req.validatedQuery as ReportRange));
  });

  trialBalance = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminFinanceReportsService.trialBalance(req.validatedQuery as TrialBalanceQuery),
    );
  });

  profitLoss = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.profitLoss(req.validatedQuery as ProfitLossQuery));
  });

  balanceSheet = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminFinanceReportsService.balanceSheet(req.validatedQuery as BalanceSheetQuery),
    );
  });

  cashFlow = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.cashFlow(req.validatedQuery as ReportRange));
  });

  ageing = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.ageing(req.validatedQuery as AgeingQuery));
  });

  partyStatement = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminFinanceReportsService.partyStatement(req.validatedQuery as PartyStatementQuery),
    );
  });

  gstr1 = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.gstr1(req.validatedQuery as ReportRange));
  });

  gstr3b = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.gstr3b(req.validatedQuery as ReportRange));
  });

  purchaseRegister = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminFinanceReportsService.purchaseRegister(req.validatedQuery as ReportRange),
    );
  });

  reconciliation = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await adminFinanceReportsService.reconciliation(req.validatedQuery as ReportRange));
  });

  /**
   * Streams an .xlsx back to the browser. Content-Disposition carries the filename so the download
   * arrives named for its period rather than as "download.xlsx" — a small thing that matters when
   * a CA is filing twelve of them.
   */
  exportWorkbook = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ExportQuery;
    const { buffer, filename } = await adminFinanceReportsService.export(
      query,
      req.user ? `${req.user.id}` : undefined,
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    return res.send(buffer);
  });
}

export const adminFinanceReportsController = new AdminFinanceReportsController();
