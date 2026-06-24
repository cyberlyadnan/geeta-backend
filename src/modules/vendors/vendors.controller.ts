import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { vendorsService } from './vendors.service.js';

export class VendorsController {
  getMyProfile = asyncHandler(async (req: Request, res: Response) => {
    const result = await vendorsService.getMyProfile(req.user!.id);
    return ApiResponse.success(res, result);
  });

  getStatusByPhone = asyncHandler(async (req: Request, res: Response) => {
    const { phone } = req.validatedParams as { phone: string };
    const result = await vendorsService.getStatusByPhone(phone);
    return ApiResponse.success(res, result);
  });
}

export const vendorsController = new VendorsController();
