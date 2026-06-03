import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { secureFileAccessService } from '../../services/storage/secure-file-access.service.js';
import { vendorComplianceService } from './vendor-compliance.service.js';

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export class VendorComplianceAdminController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams as { vendorId: string };
    const items = await vendorComplianceService.listByVendor(vendorId);
    return ApiResponse.success(res, { items });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId, requestId } = req.validatedParams as {
      vendorId: string;
      requestId: string;
    };
    const request = await vendorComplianceService.getById(vendorId, requestId);
    return ApiResponse.success(res, request);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId } = req.validatedParams as { vendorId: string };
    const request = await vendorComplianceService.create(
      vendorId,
      req.body,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.created(res, request, 'Compliance request created');
  });

  send = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId, requestId } = req.validatedParams as {
      vendorId: string;
      requestId: string;
    };
    const request = await vendorComplianceService.send(
      vendorId,
      requestId,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, request, 'Request sent to vendor');
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId, requestId } = req.validatedParams as {
      vendorId: string;
      requestId: string;
    };
    const request = await vendorComplianceService.cancel(
      vendorId,
      requestId,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, request, 'Request cancelled');
  });

  reviewResponse = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId, responseId } = req.validatedParams as {
      vendorId: string;
      responseId: string;
    };
    const { status, adminRemarks } = req.body as {
      status: 'APPROVED' | 'REJECTED';
      adminRemarks?: string;
    };
    const result = await vendorComplianceService.reviewResponse(
      vendorId,
      responseId,
      status,
      adminRemarks,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Response reviewed');
  });
}

export class VendorCompliancePublicController {
  presignUpload = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorComplianceService.presignUpload(req.body);
    return ApiResponse.success(res, result);
  });

  fileAccess = asyncHandler(async (req: Request, res: Response) => {
    const { phone, fileAssetId } = req.body as { phone: string; fileAssetId: string };
    const download = await secureFileAccessService.createVendorComplianceDownload(
      phone,
      fileAssetId,
    );
    return ApiResponse.success(res, download);
  });

  submit = asyncHandler(async (req: Request, res: Response) => {
    const pending = await vendorComplianceService.submit(req.body);
    return ApiResponse.success(
      res,
      {
        pendingComplianceRequests:
          vendorComplianceService.mapRequestForVendorStatus(pending),
      },
      'Submission received',
    );
  });
}

export const vendorComplianceAdminController = new VendorComplianceAdminController();
export const vendorCompliancePublicController = new VendorCompliancePublicController();
