import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminChannelPartnersService } from './admin-channel-partners.service.js';
import type {
  AssignVendorsInput,
  AssignableVendorsQuery,
  CommissionPlanInput,
  ListPartnersQuery,
  PartnerStatsQuery,
  PromoteVendorInput,
  UnassignVendorInput,
  UpdatePartnerInput,
} from './admin-channel-partners.validation.js';

export class AdminChannelPartnersController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.list(req.validatedQuery as ListPartnersQuery);
    return ApiResponse.success(res, result, 'Channel partners', 200, result.meta);
  });

  programmeStats = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(
      res,
      await adminChannelPartnersService.programmeStats(req.validatedQuery as PartnerStatsQuery),
    );
  });

  promote = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.promote(
      req.body as PromoteVendorInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Vendor promoted to channel partner');
  });

  detail = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.detail(
      req.params['id'] as string,
      req.validatedQuery as PartnerStatsQuery,
    );
    return ApiResponse.success(res, result);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.update(
      req.params['id'] as string,
      req.body as UpdatePartnerInput,
    );
    return ApiResponse.success(res, result, 'Partner updated');
  });

  assignVendors = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.assignVendors(
      req.params['id'] as string,
      req.body as AssignVendorsInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Vendors assigned');
  });

  unassignVendor = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.unassignVendor(
      req.params['id'] as string,
      req.params['vendorId'] as string,
      req.body as UnassignVendorInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Vendor unlinked');
  });

  assignableVendors = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.assignableVendors(
      req.params['id'] as string,
      req.validatedQuery as AssignableVendorsQuery,
    );
    return ApiResponse.success(res, result);
  });

  createCommissionPlan = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminChannelPartnersService.createCommissionPlan(
      req.params['id'] as string,
      req.body as CommissionPlanInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Commission plan saved');
  });
}

export const adminChannelPartnersController = new AdminChannelPartnersController();
