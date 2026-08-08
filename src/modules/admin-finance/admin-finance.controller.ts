import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminFinanceService } from './admin-finance.service.js';
import type {
  FinanceSummaryQuery,
  GstExportQuery,
  GstReportQuery,
  LedgerExportQuery,
} from './admin-finance.validation.js';

function sendCsv(res: Response, csv: string, filename: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

export class AdminFinanceController {
  summary = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminFinanceService.summary(req.validatedQuery as FinanceSummaryQuery);
    return ApiResponse.success(res, result);
  });

  gstReport = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminFinanceService.gstReport(req.validatedQuery as GstReportQuery);
    return ApiResponse.success(res, result);
  });

  gstReportExport = asyncHandler(async (req: Request, res: Response) => {
    const { csv, filename } = await adminFinanceService.gstReportCsv(
      req.validatedQuery as GstExportQuery,
    );
    return sendCsv(res, csv, filename);
  });

  ledgerExport = asyncHandler(async (req: Request, res: Response) => {
    const { csv, filename } = await adminFinanceService.ledgerCsv(
      req.validatedQuery as LedgerExportQuery,
    );
    return sendCsv(res, csv, filename);
  });
}

export const adminFinanceController = new AdminFinanceController();
