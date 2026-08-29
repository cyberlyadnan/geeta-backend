import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { channelPartnerService } from './channel-partner.service.js';
import type {
  PartnerOverviewQuery,
  PartnerVendorListQuery,
} from './channel-partner.validation.js';

export class ChannelPartnerController {
  /**
   * Cheap and never throws — the vendor header calls it on every load to decide whether to show
   * the partner panel switcher.
   */
  me = asyncHandler(async (req: Request, res: Response) => {
    return ApiResponse.success(res, await channelPartnerService.describe(req.user!.id));
  });

  overview = asyncHandler(async (req: Request, res: Response) => {
    const result = await channelPartnerService.overview(
      req.user!.id,
      req.validatedQuery as PartnerOverviewQuery,
    );
    return ApiResponse.success(res, result);
  });

  vendors = asyncHandler(async (req: Request, res: Response) => {
    const result = await channelPartnerService.listVendors(
      req.user!.id,
      req.validatedQuery as PartnerVendorListQuery,
    );
    return ApiResponse.success(res, result);
  });
}

export const channelPartnerController = new ChannelPartnerController();
