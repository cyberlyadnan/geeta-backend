import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { companyProfileRepository } from '../../repositories/company-profile.repository.js';
import type { UpdateCompanyProfileInput } from './company-profile.validation.js';

class CompanyProfileController {
  get = asyncHandler(async (_req: Request, res: Response) => {
    const profile = await companyProfileRepository.getOrCreate();
    return ApiResponse.success(res, profile);
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as UpdateCompanyProfileInput;
    const row = await companyProfileRepository.update(input, req.user!.id);
    return ApiResponse.success(res, row);
  });
}

export const companyProfileController = new CompanyProfileController();
