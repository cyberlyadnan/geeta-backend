import type { Request, Response } from 'express';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { storageService } from '../../services/storage/index.js';
import type { PresignedUploadInput } from '../../services/storage/storage.validation.js';

export class StorageController {
  presignUpload = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as PresignedUploadInput;
    const result = await storageService.createPresignedUpload(input);
    return ApiResponse.success(res, result);
  });
}

export const storageController = new StorageController();
