import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  ALLOWED_ARTWORK_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VENDOR_DOCUMENT_MIME_TYPES,
  MAX_ARTWORK_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VENDOR_DOCUMENT_UPLOAD_BYTES,
  type AllowedImageMimeType,
  STORAGE_FOLDERS,
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
  if (contentType === 'application/pdf') return 'pdf';
  const fromMime = MIME_TO_EXT[contentType as AllowedImageMimeType];
  if (fromMime) return fromMime;
  const ext = path.extname(fileName).replace('.', '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'cdr') return 'cdr';
  if (ext === 'ai') return 'ai';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'bin';
}

export function normalizeVendorDocumentContentType(contentType: string): string {
  const lower = contentType.toLowerCase().trim();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  return lower;
}

export function normalizeArtworkContentType(contentType: string, fileName: string): string {
  const lower = contentType.toLowerCase().trim();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower === 'application/pdf') return 'application/pdf';
  const ext = path.extname(fileName).replace('.', '').toLowerCase();

  const isGenericBinary =
    !lower ||
    lower === 'application/octet-stream' ||
    lower === 'binary/octet-stream' ||
    lower === 'application/x-msdownload';

  if (isGenericBinary && ext) {
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'cdr') return 'application/vnd.corel-draw';
    if (ext === 'ai') return 'application/illustrator';
  }

  if (ext === 'cdr' && (lower === 'application/octet-stream' || !lower)) {
    return 'application/vnd.corel-draw';
  }
  if (ext === 'ai' && (lower === 'application/octet-stream' || !lower)) {
    return 'application/illustrator';
  }
  return lower;
}

export function assertValidVendorDocumentUpload(contentType: string, fileSize: number): void {
  const normalized = normalizeVendorDocumentContentType(contentType);
  if (!(ALLOWED_VENDOR_DOCUMENT_MIME_TYPES as readonly string[]).includes(normalized)) {
    throw ApiError.badRequest('Invalid file type. Allowed: JPG, PNG, WEBP, PDF');
  }
  if (fileSize <= 0) {
    throw ApiError.badRequest('File size must be greater than 0');
  }
  if (fileSize > MAX_VENDOR_DOCUMENT_UPLOAD_BYTES) {
    throw ApiError.badRequest('File must be 10 MB or smaller');
  }
}

export function assertValidArtworkUpload(
  contentType: string,
  fileSize: number,
  fileName: string,
  maxMb?: number,
): void {
  const normalized = normalizeArtworkContentType(contentType, fileName);
  const ext = path.extname(fileName).replace('.', '').toLowerCase();
  const allowedByMime = (ALLOWED_ARTWORK_MIME_TYPES as readonly string[]).includes(normalized);
  const allowedByExt = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'cdr', 'ai'].includes(ext);

  if (!allowedByMime && !allowedByExt) {
    throw ApiError.badRequest('Invalid artwork type. Allowed: PDF, PNG, JPG, WEBP, CDR');
  }
  if (fileSize <= 0) {
    throw ApiError.badRequest('File size must be greater than 0');
  }
  const maxBytes = maxMb ? maxMb * 1024 * 1024 : MAX_ARTWORK_UPLOAD_BYTES;
  if (fileSize > maxBytes) {
    throw ApiError.badRequest(`Artwork must be ${maxMb ?? 50} MB or smaller`);
  }
}

export function buildVendorComplianceObjectKey(
  vendorProfileId: string,
  fileName: string,
  contentType: string,
): string {
  const safeName = sanitizeFileName(fileName);
  const ext = resolveExtension(contentType, safeName);
  const stamp = Date.now();
  const random = randomBytes(8).toString('hex');
  const base = safeName.replace(/\.[^.]+$/, '');
  return `${STORAGE_FOLDERS.VENDORS}/compliance/${vendorProfileId}/${stamp}-${random}-${base}.${ext}`;
}

export function buildArtworkObjectKey(
  userId: string,
  versionId: string,
  fileName: string,
  contentType: string,
): string {
  const safeName = sanitizeFileName(fileName);
  const ext = resolveExtension(contentType, safeName);
  const stamp = Date.now();
  const random = randomBytes(8).toString('hex');
  const base = safeName.replace(/\.[^.]+$/, '');
  return `${STORAGE_FOLDERS.ARTWORK}/${userId}/${versionId}/${stamp}-${random}-${base}.${ext}`;
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

export function isPreviewableArtwork(ext: string): boolean {
  return ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext.toLowerCase());
}

export function isVectorArtwork(ext: string): boolean {
  return ['cdr', 'ai', 'eps', 'psd'].includes(ext.toLowerCase());
}
