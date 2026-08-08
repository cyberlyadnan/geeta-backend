import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { catalogVersionService } from './catalog-version.service.js';
import { vendorBootstrapService } from './vendor-bootstrap.service.js';
import { vendorFamilyProductsService } from './vendor-family-products.service.js';
import { vendorGalleryService } from './vendor-gallery.service.js';

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

  /** Family → merged products (Series hidden). Prefer vendor bootstrap cache on the client. */
  familyProducts = asyncHandler(async (req: Request, res: Response) => {
    const familyId = typeof req.params['familyId'] === 'string' ? req.params['familyId'] : undefined;
    if (!familyId) throw ApiError.badRequest('familyId is required');
    const items = await vendorFamilyProductsService.getProductsForFamily(familyId);
    return ApiResponse.success(res, { items });
  });

  /** Catalogue designs (fixed-price products) as a browsable gallery. */
  galleryList = asyncHandler(async (req: Request, res: Response) => {
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    const result = await vendorGalleryService.list(search);
    return ApiResponse.success(res, result);
  });

  galleryDetail = asyncHandler(async (req: Request, res: Response) => {
    const productId = typeof req.params['productId'] === 'string' ? req.params['productId'] : undefined;
    if (!productId) throw ApiError.badRequest('productId is required');
    const result = await vendorGalleryService.detail(productId);
    return ApiResponse.success(res, result);
  });
}

export const vendorCatalogController = new VendorCatalogController();
