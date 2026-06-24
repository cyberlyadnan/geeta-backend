import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { secureFileAccessService } from '../../services/storage/secure-file-access.service.js';
import { adminVendorsService } from './admin-vendors.service.js';
import type { ListVendorsQuery, VendorActivityFeedQuery } from './admin-vendors.validation.js';

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export class AdminVendorsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const query = req.validatedQuery as ListVendorsQuery;
    const result = await adminVendorsService.list(query);
    return ApiResponse.success(res, result);
  });

  stats = asyncHandler(async (_req: Request, res: Response) => {
    const result = await adminVendorsService.getStats();
    return ApiResponse.success(res, result);
  });

  activityFeed = asyncHandler(async (req: Request, res: Response) => {
    const { limit } = req.validatedQuery as VendorActivityFeedQuery;
    const result = await adminVendorsService.getActivityFeed(limit);
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminVendorsService.getById(id);
    return ApiResponse.success(res, result);
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminVendorsService.updateStatus(
      id,
      req.body,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, result, 'Vendor status updated');
  });

  addNote = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminVendorsService.addNote(
      id,
      req.body,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.created(res, result, 'Note added');
  });

  updateDeliveryPreference = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminVendorsService.updateDeliveryPreference(
      id,
      req.body,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, result, 'Delivery preference updated');
  });

  fileAssetAccess = asyncHandler(async (req: Request, res: Response) => {
    const { id, fileAssetId } = req.validatedParams as { id: string; fileAssetId: string };
    const download = await secureFileAccessService.createAdminVendorComplianceDownload(
      id,
      fileAssetId,
    );
    return ApiResponse.success(res, download);
  });
}

export const adminVendorsController = new AdminVendorsController();
