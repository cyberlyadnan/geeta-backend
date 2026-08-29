import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { vendorReportExportService } from './vendor-report-export.service.js';
import { vendorReportsService } from './vendor-reports.service.js';
import type {
  InvoiceListQuery,
  PurchaseReportQuery,
  SummaryQuery,
  VendorExportQuery,
  WalletStatementQuery,
} from './vendor-reports.validation.js';

export class VendorReportsController {
  summary = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorReportsService.summary(req.user!.id, req.validatedQuery as SummaryQuery);
    return ApiResponse.success(res, result);
  });

  purchases = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorReportsService.purchaseReport(
      req.user!.id,
      req.validatedQuery as PurchaseReportQuery,
    );
    return ApiResponse.success(res, result, 'Purchase register', 200, result.meta);
  });

  purchaseFilters = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await vendorReportsService.purchaseFilters(req.user!.id));
  });

  invoices = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorReportsService.invoices(req.user!.id, req.validatedQuery as InvoiceListQuery);
    return ApiResponse.success(res, result, 'Invoices', 200, result.meta);
  });

  invoiceDownload = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorReportsService.invoiceDownloadUrl(req.user!.id, req.params['id'] as string);
    return ApiResponse.success(res, result);
  });

  wallet = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorReportsService.walletStatement(
      req.user!.id,
      req.validatedQuery as WalletStatementQuery,
    );
    return ApiResponse.success(res, result, 'Wallet statement', 200, result.meta);
  });

  exportWorkbook = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename } = await vendorReportExportService.build(
      req.user!.id,
      req.validatedQuery as VendorExportQuery,
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    return res.send(buffer);
  });
}

export const vendorReportsController = new VendorReportsController();
