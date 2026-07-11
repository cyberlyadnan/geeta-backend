import type { Request, Response } from 'express';
import { ApiError } from '../../common/errors/ApiError.js';
import { ApiResponse } from '../../common/responses/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { storageService } from '../../services/storage/index.js';
import type {
  ImageMultipartBodyInput,
  PresignedUploadInput,
} from '../../services/storage/storage.validation.js';

function mapStorageUploadError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const message = err instanceof Error ? err.message : 'Upload failed';
  const lower = message.toLowerCase();

  if (
    lower.includes('credentials') ||
    lower.includes('access denied') ||
    lower.includes('not configured') ||
    lower.includes('storage_not_configured')
  ) {
    return ApiError.serviceUnavailable(
      'Image storage is not configured on the server. Contact support or set R2 environment variables.',
      'STORAGE_NOT_CONFIGURED',
    );
  }

  if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused')) {
    return ApiError.serviceUnavailable('Could not reach image storage. Please try again.', 'STORAGE_UNAVAILABLE');
  }

  return ApiError.internal(`Image upload failed: ${message}`);
}

export class StorageController {
  presignUpload = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as PresignedUploadInput;
    const result = await storageService.createPresignedUpload(input);
    return ApiResponse.success(res, result);
  });

  uploadImage = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      throw ApiError.badRequest('Image file is required');
    }

    const { folder } = req.body as ImageMultipartBodyInput;

    try {
      const result = await storageService.uploadImageFromBuffer({
        folder,
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      return ApiResponse.success(res, result);
    } catch (err) {
      throw mapStorageUploadError(err);
    }
  });
}

export const storageController = new StorageController();
