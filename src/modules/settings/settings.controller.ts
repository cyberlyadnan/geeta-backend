import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { settingsService } from './settings.service.js';

export class SettingsController {
  list = asyncHandler(async (_req: Request, res: Response) => {
    const result = await settingsService.findAll();
    return ApiResponse.success(res, result);
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const result = await settingsService.findById(req.params['id'] as string);
    return ApiResponse.success(res, result);
  });
}

export const settingsController = new SettingsController();
