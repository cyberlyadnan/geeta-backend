import { createReadStream } from 'node:fs';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertR2Config, getPresignS3Client, getS3Client } from './storage.provider.js';
import {
  assertValidImageUpload,
  assertValidVendorDocumentUpload,
  buildObjectKey,
  buildPublicUrl,
  buildVendorComplianceObjectKey,
  normalizeImageContentType,
  normalizeVendorDocumentContentType,
} from './storage.utils.js';
import type {
  CatalogImageUploadFolder,
  PresignedUploadRequest,
  PresignedUploadResult,
  StorageFolder,
  VendorCompliancePresignResult,
} from './storage.types.js';
import { STORAGE_FOLDERS } from './storage.types.js';

const PRESIGN_UPLOAD_EXPIRY_SECONDS = 600;
/** Short-lived download URLs — not shareable long-term. */
const PRESIGN_DOWNLOAD_EXPIRY_SECONDS = 300;

export interface PresignedDownloadResult {
  url: string;
  expiresIn: number;
  expiresAt: string;
}

export class StorageService {
  createPresignedUpload(input: PresignedUploadRequest): Promise<PresignedUploadResult> {
    const contentType = normalizeImageContentType(input.contentType);
    assertValidImageUpload(contentType, input.fileSize);
    const config = assertR2Config();
    const key = buildObjectKey(input.folder, input.fileName, contentType);
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const client = getPresignS3Client();

    return getSignedUrl(client, command, {
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
      /** Must match headers sent by the browser PUT */
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      publicUrl,
      contentType,
      uploadHeaders: { 'Content-Type': contentType },
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
    }));
  }

  async createPresignedDownload(
    key: string,
    options?: { fileName?: string; mimeType?: string; disposition?: 'inline' | 'attachment' },
  ): Promise<PresignedDownloadResult> {
    if (!key?.trim()) {
      throw new Error('File key is required');
    }
    const config = assertR2Config();
    const fileName = options?.fileName?.trim() || 'document';
    const mode = options?.disposition ?? 'inline';
    const disposition = `${mode}; filename="${fileName.replace(/"/g, '')}"`;

    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ResponseContentDisposition: disposition,
      ...(options?.mimeType ? { ResponseContentType: options.mimeType } : {}),
    });

    const client = getPresignS3Client();
    const expiresIn = PRESIGN_DOWNLOAD_EXPIRY_SECONDS;
    const url = await getSignedUrl(client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return { url, expiresIn, expiresAt };
  }

  async deleteObject(key: string): Promise<void> {
    if (!key?.trim()) return;
    const config = assertR2Config();
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      }),
    );
  }

  getPublicUrlForKey(key: string): string {
    const config = assertR2Config();
    return buildPublicUrl(config.publicUrl, key);
  }

  async putArtworkObjectFromFile(input: {
    key: string;
    filePath: string;
    contentType: string;
    fileSize: number;
  }): Promise<void> {
    const config = assertR2Config();
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: input.key,
        Body: createReadStream(input.filePath),
        ContentType: input.contentType,
        ContentLength: input.fileSize,
      }),
    );
  }

  /**
   * Uploads a generated PDF (invoices) straight from memory. Separate from the image helpers
   * because those force an image content type through normalizeImageContentType; this is the
   * same PutObjectCommand path with application/pdf.
   */
  async uploadPdfFromBuffer(input: {
    folder: StorageFolder;
    buffer: Buffer;
    fileName: string;
  }): Promise<{ key: string; publicUrl: string }> {
    const contentType = 'application/pdf';
    const config = assertR2Config();
    const key = buildObjectKey(input.folder, input.fileName, contentType);
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: input.buffer,
        ContentType: contentType,
        ContentLength: input.buffer.byteLength,
      }),
    );

    return { key, publicUrl };
  }

  async uploadImageFromBuffer(input: {
    folder: CatalogImageUploadFolder;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    fileSize: number;
  }): Promise<PresignedUploadResult> {
    const contentType = normalizeImageContentType(input.mimeType);
    assertValidImageUpload(contentType, input.fileSize);
    const config = assertR2Config();
    const key = buildObjectKey(input.folder, input.originalName, contentType);
    const publicUrl = buildPublicUrl(config.publicUrl, key);
    const client = getS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: input.buffer,
        ContentType: contentType,
        ContentLength: input.fileSize,
      }),
    );

    return {
      uploadUrl: publicUrl,
      key,
      publicUrl,
      contentType,
      uploadHeaders: { 'Content-Type': contentType },
      expiresIn: 0,
    };
  }

  async uploadImageFromFile(input: {
    folder: CatalogImageUploadFolder;
    filePath: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
  }): Promise<PresignedUploadResult> {
    const contentType = normalizeImageContentType(input.mimeType);
    assertValidImageUpload(contentType, input.fileSize);
    const config = assertR2Config();
    const key = buildObjectKey(input.folder, input.originalName, contentType);
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    await this.putArtworkObjectFromFile({
      key,
      filePath: input.filePath,
      contentType,
      fileSize: input.fileSize,
    });

    return {
      uploadUrl: publicUrl,
      key,
      publicUrl,
      contentType,
      uploadHeaders: { 'Content-Type': contentType },
      expiresIn: 0,
    };
  }

  createPresignedVendorComplianceUpload(
    vendorProfileId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<VendorCompliancePresignResult> {
    const normalized = normalizeVendorDocumentContentType(contentType);
    assertValidVendorDocumentUpload(normalized, fileSize);
    const config = assertR2Config();
    const key = buildVendorComplianceObjectKey(vendorProfileId, fileName, normalized);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: normalized,
    });

    const client = getPresignS3Client();

    return getSignedUrl(client, command, {
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      contentType: normalized,
      uploadHeaders: { 'Content-Type': normalized },
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
    }));
  }

  createPresignedProductionAttachmentUpload(
    taskId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<PresignedUploadResult> {
    const normalized = normalizeVendorDocumentContentType(contentType);
    assertValidVendorDocumentUpload(normalized, fileSize);
    const config = assertR2Config();
    const key = buildObjectKey(STORAGE_FOLDERS.PRODUCTION, `${taskId}/${fileName}`, normalized);
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: normalized,
    });

    const client = getPresignS3Client();

    return getSignedUrl(client, command, {
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      publicUrl,
      contentType: normalized,
      uploadHeaders: { 'Content-Type': normalized },
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
    }));
  }

  /** Design reference material (photos, logos, existing artwork to redo) a vendor uploads before
   *  the order carrying them exists yet — keyed by vendor, not by order or design task. */
  createPresignedDesignAttachmentUpload(
    vendorUserId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<PresignedUploadResult> {
    const normalized = normalizeVendorDocumentContentType(contentType);
    assertValidVendorDocumentUpload(normalized, fileSize);
    const config = assertR2Config();
    const key = buildObjectKey(STORAGE_FOLDERS.DESIGN, `${vendorUserId}/${fileName}`, normalized);
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: normalized,
    });

    const client = getPresignS3Client();

    return getSignedUrl(client, command, {
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      publicUrl,
      contentType: normalized,
      uploadHeaders: { 'Content-Type': normalized },
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
    }));
  }

  /** A design proof/finished artwork the design team uploads straight to a design task —
   *  keyed by task, not by vendor, since it belongs to the order rather than to whoever
   *  designed it. Reuses the DESIGN folder that reference-material attachments also use. */
  createPresignedDesignProofUpload(
    designTaskId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<PresignedUploadResult> {
    const normalized = normalizeVendorDocumentContentType(contentType);
    assertValidVendorDocumentUpload(normalized, fileSize);
    const config = assertR2Config();
    const key = buildObjectKey(
      STORAGE_FOLDERS.DESIGN,
      `proofs/${designTaskId}/${fileName}`,
      normalized,
    );
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: normalized,
    });

    const client = getPresignS3Client();

    return getSignedUrl(client, command, {
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      publicUrl,
      contentType: normalized,
      uploadHeaders: { 'Content-Type': normalized },
      expiresIn: PRESIGN_UPLOAD_EXPIRY_SECONDS,
    }));
  }
}

export const storageService = new StorageService();
