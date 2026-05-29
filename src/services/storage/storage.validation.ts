import { z } from 'zod';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_UPLOAD_BYTES, STORAGE_FOLDERS } from './storage.types.js';
import { normalizeImageContentType } from './storage.utils.js';

export const presignedUploadSchema = z.object({
  folder: z.enum([
    STORAGE_FOLDERS.SLIDERS,
    STORAGE_FOLDERS.PRODUCTS,
    STORAGE_FOLDERS.CATEGORIES,
    STORAGE_FOLDERS.VENDORS,
    STORAGE_FOLDERS.USERS,
    STORAGE_FOLDERS.DOCUMENTS,
    STORAGE_FOLDERS.SUPPORT,
    STORAGE_FOLDERS.REPORTS,
    STORAGE_FOLDERS.INVOICES,
    STORAGE_FOLDERS.MARKETING,
  ]),
  fileName: z.string().min(1).max(255),
  contentType: z
    .string()
    .min(1)
    .transform((v) => normalizeImageContentType(v))
    .refine((v) => (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(v), {
      message: 'Invalid image type. Allowed: JPG, JPEG, PNG, WEBP',
    }),
  fileSize: z.coerce.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
});

export type PresignedUploadInput = z.infer<typeof presignedUploadSchema>;
