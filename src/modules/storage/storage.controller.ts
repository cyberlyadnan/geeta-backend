import type { Request, Response } from 'express';
import { unlink } from 'node:fs/promises';
import { ApiError } from '../../common/errors/ApiError.js';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { storageService } from '../../services/storage/index.js';
import type {
  ImageMultipartBodyInput,
  PresignedUploadInput,
} from '../../services/storage/storage.validation.js';

export class StorageController {
  presignUpload = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as PresignedUploadInput;
    const result = await storageService.createPresignedUpload(input);
    return ApiResponse.success(res, result);
  });

  uploadImage = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      throw ApiError.badRequest('Image file is required');
    }

    const { folder } = req.body as ImageMultipartBodyInput;

    try {
      const result = await storageService.uploadImageFromFile({
        folder,
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      return ApiResponse.success(res, result);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  });
}

export const storageController = new StorageController();
