import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { catalogVersionService } from './catalog-version.service.js';
import { vendorBootstrapService } from './vendor-bootstrap.service.js';

export class VendorCatalogController {
  bootstrap = asyncHandler(async (_req: Request, res: Response) => {
    const payload = await vendorBootstrapService.getBootstrap();
    if (payload.etag) {
      res.setHeader('ETag', payload.etag);
    }
    return ApiResponse.success(res, payload);
  });

  catalogVersion = asyncHandler(async (req: Request, res: Response) => {
    const version = await catalogVersionService.getVersion();
    const etag = catalogVersionService.buildEtag(version);
    res.setHeader('ETag', etag);

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      return res.status(StatusCodes.NOT_MODIFIED).end();
    }

    return ApiResponse.success(res, { ...version, etag });
  });
}

export const vendorCatalogController = new VendorCatalogController();
