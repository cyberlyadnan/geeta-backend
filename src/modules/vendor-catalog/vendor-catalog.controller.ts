import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { catalogVersionService } from './catalog-version.service.js';
import { vendorBootstrapService } from './vendor-bootstrap.service.js';

export class VendorCatalogController {
  bootstrap = asyncHandler(async (_req: Request, res: Response) => {
    const payload = await vendorBootstrapService.getBootstrap();
    return ApiResponse.success(res, payload);
  });

  catalogVersion = asyncHandler(async (_req: Request, res: Response) => {
    const version = await catalogVersionService.getVersion();
    return ApiResponse.success(res, version);
  });
}

export const vendorCatalogController = new VendorCatalogController();
