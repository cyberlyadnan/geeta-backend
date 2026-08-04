import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { retailCustomerService } from './retail-customer.service.js';
import type { CreateRetailCustomerInput, LookupRetailCustomerQuery } from './retail-customer.validation.js';

export class RetailCustomerController {
  lookup = asyncHandler(async (req: Request, res: Response) => {
    const { phone } = req.validatedQuery as LookupRetailCustomerQuery;
    const result = await retailCustomerService.lookupByPhone(phone);
    return ApiResponse.success(res, result);
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const result = await retailCustomerService.create(req.body as CreateRetailCustomerInput, req.user!.id);
    return ApiResponse.created(res, result, 'Retail customer created');
  });
}

export const retailCustomerController = new RetailCustomerController();
