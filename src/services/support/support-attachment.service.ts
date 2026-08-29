import { SupportAttachmentKind } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { storageService } from '../storage/index.js';
import { STORAGE_FOLDERS } from '../storage/storage.types.js';
import { supportSettingsService } from './support-settings.service.js';

export const SUPPORT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

/**
 * Video is the whole point of the "other complaint" flow — a vendor filming a mis-registered sheet
 * or a crushed carton settles an argument that ten messages could not. So the desk accepts the
 * formats a phone actually produces, not a theoretical list.
 */
export const SUPPORT_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/3gpp',
] as const;

export const SUPPORT_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;

export function kindForMimeType(mimeType: string): SupportAttachmentKind | null {
  const normalised = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if ((SUPPORT_IMAGE_MIME_TYPES as readonly string[]).includes(normalised)) return SupportAttachmentKind.IMAGE;
  if ((SUPPORT_VIDEO_MIME_TYPES as readonly string[]).includes(normalised)) return SupportAttachmentKind.VIDEO;
  if ((SUPPORT_DOCUMENT_MIME_TYPES as readonly string[]).includes(normalised)) return SupportAttachmentKind.DOCUMENT;
  return null;
}

export interface SupportUploadTicket {
  uploadUrl: string;
  fileKey: string;
  kind: SupportAttachmentKind;
  expiresInSeconds: number;
  maxSizeBytes: number;
}

/**
 * Media on a support ticket.
 *
 * Uploads go browser-to-storage through a presigned URL rather than through the API. A 90 MB video
 * of a damaged consignment travelling through the Node process would tie up a worker for the
 * duration and cap out on body size; the presigned route keeps the API's job to authorising the
 * upload and recording that it happened.
 *
 * Reads go the same way in reverse: attachments are stored by key and served as short-lived
 * presigned links, so a vendor's photo of their own job is never a guessable public URL.
 */
export class SupportAttachmentService {
  async createUploadTicket(input: {
    fileName: string;
    contentType: string;
    fileSize: number;
    userId: string;
  }): Promise<SupportUploadTicket> {
    const kind = kindForMimeType(input.contentType);
    if (!kind) {
      throw ApiError.badRequest(
        'That file type is not supported. Please attach a photo (JPG, PNG, WEBP), a video (MP4, MOV, WEBM) or a PDF.',
      );
    }

    const settings = await supportSettingsService.get();
    const maxSizeBytes =
      kind === SupportAttachmentKind.VIDEO
        ? settings.maxVideoSizeMb * 1024 * 1024
        : settings.maxImageSizeMb * 1024 * 1024;

    if (input.fileSize > maxSizeBytes) {
      const limitMb = Math.round(maxSizeBytes / (1024 * 1024));
      throw ApiError.badRequest(
        kind === SupportAttachmentKind.VIDEO
          ? `That video is too large. Please keep videos under ${String(limitMb)} MB — a short clip of the problem is enough.`
          : `That file is too large. Please keep it under ${String(limitMb)} MB.`,
      );
    }

    const presigned = await storageService.createPresignedMediaUpload({
      folder: STORAGE_FOLDERS.SUPPORT,
      fileName: input.fileName,
      contentType: input.contentType,
    });

    return {
      uploadUrl: presigned.uploadUrl,
      fileKey: presigned.key,
      kind,
      expiresInSeconds: presigned.expiresIn,
      maxSizeBytes,
    };
  }

  /** Short-lived view links for a ticket's media. */
  async presignAttachments(
    attachments: Array<{ id: string; fileKey: string; mimeType: string; thumbnailKey: string | null }>,
  ): Promise<Map<string, { url: string | null; thumbnailUrl: string | null }>> {
    const out = new Map<string, { url: string | null; thumbnailUrl: string | null }>();
    for (const attachment of attachments) {
      const [url, thumbnailUrl] = await Promise.all([
        this.safePresign(attachment.fileKey, attachment.mimeType),
        attachment.thumbnailKey ? this.safePresign(attachment.thumbnailKey, 'image/jpeg') : Promise.resolve(null),
      ]);
      out.set(attachment.id, { url, thumbnailUrl });
    }
    return out;
  }

  /**
   * A missing or unreadable object must not break the ticket page: the vendor still needs to read
   * the conversation and see the decision, even if one attachment has gone.
   */
  private async safePresign(key: string, mimeType?: string): Promise<string | null> {
    try {
      const result = await storageService.createPresignedDownload(key, { mimeType });
      return result.url;
    } catch {
      return null;
    }
  }

  async assertWithinAttachmentLimit(ticketId: string, adding: number): Promise<void> {
    const settings = await supportSettingsService.get();
    const existing = await prisma.supportTicketAttachment.count({ where: { ticketId } });
    if (existing + adding > settings.maxAttachmentsPerTicket) {
      throw ApiError.badRequest(
        `A ticket can hold up to ${String(settings.maxAttachmentsPerTicket)} attachments. Please remove one before adding another.`,
      );
    }
  }
}

export const supportAttachmentService = new SupportAttachmentService();
