import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { vendorsService } from './vendors.service.js';

export class VendorsController {
  getStatusByPhone = asyncHandler(async (req: Request, res: Response) => {
    const phone = req.params['phone'] as string;
    const result = await vendorsService.getStatusByPhone(phone);
    return ApiResponse.success(res, result);
  });
}

export const vendorsController = new VendorsController();
