import multer from 'multer';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
} from '../../services/storage/storage.types.js';
import { normalizeImageContentType } from '../../services/storage/storage.utils.js';

export const imageMultipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const normalized = normalizeImageContentType(file.mimetype);
    if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(normalized)) {
      cb(null, true);
      return;
    }
    cb(
      ApiError.badRequest('Invalid image type. Allowed: JPG, JPEG, PNG, WEBP'),
    );
  },
});
