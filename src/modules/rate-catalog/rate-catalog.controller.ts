import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { rateCatalogService } from './rate-catalog.service.js';
import type {
  RateCatalogCategoriesQuery,
  RateCatalogExportQuery,
  RateCatalogProductRatesQuery,
  RateCatalogProductsQuery,
} from './rate-catalog.validation.js';

export class RateCatalogController {
  listCategories = asyncHandler(async (req: Request, res: Response) => {
    const data = await rateCatalogService.listCategories(
      req.validatedQuery as RateCatalogCategoriesQuery,
    );
    ApiResponse.success(res, data);
  });

  listProducts = asyncHandler(async (req: Request, res: Response) => {
    const data = await rateCatalogService.listProducts(
      req.validatedQuery as RateCatalogProductsQuery,
    );
    ApiResponse.success(res, data);
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const data = await rateCatalogService.search(req.validatedQuery as RateCatalogProductsQuery);
    ApiResponse.success(res, data);
  });

  getFilters = asyncHandler(async (_req: Request, res: Response) => {
    const data = await rateCatalogService.getFilterOptions();
    ApiResponse.success(res, data);
  });

  getProductRates = asyncHandler(async (req: Request, res: Response) => {
    const data = await rateCatalogService.getProductRates(
      req.params['id'] as string,
      req.validatedQuery as RateCatalogProductRatesQuery,
    );
    ApiResponse.success(res, data);
  });

  exportPdf = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename, contentType } = await rateCatalogService.exportPdf(
      req.params['id'] as string,
      req.validatedQuery as RateCatalogExportQuery,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  });

  exportExcel = asyncHandler(async (req: Request, res: Response) => {
    const { buffer, filename, contentType } = await rateCatalogService.exportExcel(
      req.params['id'] as string,
      req.validatedQuery as RateCatalogExportQuery,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });
}

export const rateCatalogController = new RateCatalogController();
