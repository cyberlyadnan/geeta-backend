import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminPricingMatrixService } from './admin-pricing-matrix.service.js';
import { adminFlexPricingService } from './admin-flex-pricing.service.js';
import { adminVendorOverridesService } from './admin-vendor-overrides.service.js';
import type {
  CreateModifierRuleInput,
  CreateVendorOverrideInput,
  ListVendorOverridesQuery,
  VendorIdQuery,
  SaveMatrixCellsInput,
  UpdateFlexPricingInput,
  UpdateModifierRuleInput,
} from './admin-pricing-spine.validation.js';

export class AdminPricingSpineController {
  // Matrix cells
  getMatrix = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedQuery as { versionId: string };
    const result = await adminPricingMatrixService.list(versionId);
    return ApiResponse.success(res, result);
  });

  saveMatrixCells = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPricingMatrixService.saveCells(req.body as SaveMatrixCellsInput, req.user!.id);
    return ApiResponse.success(res, result, 'Price matrix saved');
  });

  deleteMatrixCell = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminPricingMatrixService.deleteCell(id, req.user!.id);
    return ApiResponse.success(res, result, 'Matrix cell deleted');
  });

  // Modifier rules
  createModifierRule = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminPricingMatrixService.createModifierRule(
      req.body as CreateModifierRuleInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Price modifier rule created');
  });

  updateModifierRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminPricingMatrixService.updateModifierRule(
      id,
      req.body as UpdateModifierRuleInput,
      req.user!.id,
    );
    return ApiResponse.success(res, result, 'Price modifier rule updated');
  });

  deleteModifierRule = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminPricingMatrixService.deleteModifierRule(id, req.user!.id);
    return ApiResponse.success(res, result, 'Price modifier rule deleted');
  });

  // Roll/flex pricing
  getFlexPricing = asyncHandler(async (req: Request, res: Response) => {
    const { versionId } = req.validatedQuery as { versionId: string };
    const result = await adminFlexPricingService.get(versionId);
    return ApiResponse.success(res, result);
  });

  updateFlexPricing = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminFlexPricingService.update(req.body as UpdateFlexPricingInput, req.user!.id);
    return ApiResponse.success(res, result, 'Roll/flex pricing updated');
  });

  // Vendor overrides
  listVendorOverrides = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminVendorOverridesService.list(req.validatedQuery as ListVendorOverridesQuery);
    return ApiResponse.success(res, result);
  });

  /** Every negotiated price for one vendor — the account-manager view. */
  listVendorOverridesByVendor = asyncHandler(async (req: Request, res: Response) => {
    const { vendorId } = req.validatedQuery as VendorIdQuery;
    const result = await adminVendorOverridesService.listForVendor(vendorId);
    return ApiResponse.success(res, result);
  });

  createVendorOverride = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminVendorOverridesService.create(
      req.body as CreateVendorOverrideInput,
      req.user!.id,
    );
    return ApiResponse.created(res, result, 'Vendor price override saved');
  });

  deleteVendorOverride = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.validatedParams as { id: string };
    const result = await adminVendorOverridesService.delete(id, req.user!.id);
    return ApiResponse.success(res, result, 'Vendor price override deleted');
  });
}

export const adminPricingSpineController = new AdminPricingSpineController();
