import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { deliveryService } from './delivery.service.js';

export class DeliveryController {
  getVendorSettings = asyncHandler(async (req: Request, res: Response) => {
    const data = await deliveryService.getVendorDeliveryContext(req.user!.id);
    ApiResponse.success(res, data);
  });

  updateVendorPreference = asyncHandler(async (req: Request, res: Response) => {
    const data = await deliveryService.updateVendorDeliveryPreference(
      req.user!.id,
      req.body,
      { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined },
    );
    ApiResponse.success(res, data, 'Delivery preference updated');
  });

  calculateOrderDelivery = asyncHandler(async (req: Request, res: Response) => {
    const data = await deliveryService.calculateOrderDelivery(req.user!.id, req.body);
    ApiResponse.success(res, data);
  });

  getAdminSettings = asyncHandler(async (_req: Request, res: Response) => {
    const data = await deliveryService.getAdminSettings();
    ApiResponse.success(res, data);
  });

  updateAdminSettings = asyncHandler(async (req: Request, res: Response) => {
    const data = await deliveryService.updateAdminSettings(
      req.user!.id,
      req.body,
      { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined },
    );
    ApiResponse.success(res, data, 'Delivery settings updated');
  });
}

export const deliveryController = new DeliveryController();
