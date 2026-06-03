export const STORAGE_FOLDERS = {
  SLIDERS: 'sliders',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  VENDORS: 'vendors',
  USERS: 'users',
  DOCUMENTS: 'documents',
  SUPPORT: 'support',
  REPORTS: 'reports',
  INVOICES: 'invoices',
  MARKETING: 'marketing',
} as const;

export type StorageFolder = (typeof STORAGE_FOLDERS)[keyof typeof STORAGE_FOLDERS];

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_VENDOR_DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_VENDOR_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface PresignedUploadRequest {
  folder: StorageFolder;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  contentType: string;
  uploadHeaders: Record<string, string>;
  expiresIn: number;
}

/** Vendor compliance uploads — no permanent public URL returned to clients. */
export interface VendorCompliancePresignResult {
  uploadUrl: string;
  key: string;
  contentType: string;
  uploadHeaders: Record<string, string>;
  expiresIn: number;
}

export interface StoredObjectRef {
  key: string;
  publicUrl: string;
}
