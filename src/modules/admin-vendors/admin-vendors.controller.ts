import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { adminVendorsService } from './admin-vendors.service.js';

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export class AdminVendorsController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const result = await adminVendorsService.list(req.query as never);
    return ApiResponse.success(res, result);
  });

  stats = asyncHandler(async (_req: Request, res: Response) => {
    const result = await adminVendorsService.getStats();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const result = await adminVendorsService.getById(id);
    return ApiResponse.success(res, result);
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const result = await adminVendorsService.updateStatus(
      id,
      req.body,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.success(res, result, 'Vendor status updated');
  });

  addNote = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const result = await adminVendorsService.addNote(
      id,
      req.body,
      req.user!.id,
      requestMeta(req),
    );
    return ApiResponse.created(res, result, 'Note added');
  });
}

export const adminVendorsController = new AdminVendorsController();
