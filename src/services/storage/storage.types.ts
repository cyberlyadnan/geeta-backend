export const STORAGE_FOLDERS = {
  SLIDERS: 'sliders',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  FAMILIES: 'families',
  SERIES: 'series',
  VENDORS: 'vendors',
  USERS: 'users',
  DOCUMENTS: 'documents',
  SUPPORT: 'support',
  REPORTS: 'reports',
  INVOICES: 'invoices',
  MARKETING: 'marketing',
  ARTWORK: 'artwork',
  PRODUCTION: 'production',
} as const;

export type CatalogImageUploadFolder =
  | typeof STORAGE_FOLDERS.SLIDERS
  | typeof STORAGE_FOLDERS.PRODUCTS
  | typeof STORAGE_FOLDERS.CATEGORIES
  | typeof STORAGE_FOLDERS.FAMILIES
  | typeof STORAGE_FOLDERS.SERIES;

export type StorageFolder = (typeof STORAGE_FOLDERS)[keyof typeof STORAGE_FOLDERS];

export const CATALOG_IMAGE_UPLOAD_FOLDERS = [
  STORAGE_FOLDERS.SLIDERS,
  STORAGE_FOLDERS.PRODUCTS,
  STORAGE_FOLDERS.CATEGORIES,
  STORAGE_FOLDERS.FAMILIES,
  STORAGE_FOLDERS.SERIES,
] as const satisfies readonly CatalogImageUploadFolder[];

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

/** Print artwork — PDF and raster, up to 50 MB by default */
export const ALLOWED_ARTWORK_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/postscript',
  'application/illustrator',
  'application/vnd.corel-draw',
] as const;

export const MAX_ARTWORK_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

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
