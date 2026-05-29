import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  type AllowedImageMimeType,
  type StorageFolder,
} from './storage.types.js';
import { ApiError } from '../../common/errors/ApiError.js';

const MIME_TO_EXT: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
  return base.slice(0, 120) || 'file';
}

export function resolveExtension(contentType: string, fileName: string): string {
  const fromMime = MIME_TO_EXT[contentType as AllowedImageMimeType];
  if (fromMime) return fromMime;
  const ext = path.extname(fileName).replace('.', '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

export function buildObjectKey(folder: StorageFolder, fileName: string, contentType: string): string {
  const safeName = sanitizeFileName(fileName);
  const ext = resolveExtension(contentType, safeName);
  const stamp = Date.now();
  const random = randomBytes(8).toString('hex');
  const base = safeName.replace(/\.[^.]+$/, '');
  return `${folder}/${stamp}-${random}-${base}.${ext}`;
}

/** Normalize browser MIME variants for validation and R2 upload headers */
export function normalizeImageContentType(contentType: string): AllowedImageMimeType {
  const lower = contentType.toLowerCase().trim();
  if (lower === 'image/jpg' || lower === 'image/pjpeg' || lower === 'image/jpeg') {
    return 'image/jpeg';
  }
  if (lower === 'image/png') return 'image/png';
  if (lower === 'image/webp') return 'image/webp';
  return lower as AllowedImageMimeType;
}

export function assertValidImageUpload(contentType: string, fileSize: number): void {
  const normalized = normalizeImageContentType(contentType);
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(normalized)) {
    throw ApiError.badRequest(
      'Invalid image type. Allowed: JPG, JPEG, PNG, WEBP',
    );
  }
  if (fileSize <= 0) {
    throw ApiError.badRequest('File size must be greater than 0');
  }
  if (fileSize > MAX_IMAGE_UPLOAD_BYTES) {
    throw ApiError.badRequest('Image must be 5 MB or smaller');
  }
}

export function buildPublicUrl(publicBaseUrl: string, key: string): string {
  const base = publicBaseUrl.replace(/\/$/, '');
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/${encodedKey}`;
}
