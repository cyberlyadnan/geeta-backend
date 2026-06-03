import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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
import type { PresignedUploadRequest, PresignedUploadResult } from './storage.types.js';

const PRESIGN_EXPIRY_SECONDS = 600;

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
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      /** Must match headers sent by the browser PUT */
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      publicUrl,
      contentType,
      uploadHeaders: { 'Content-Type': contentType },
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    }));
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

  createPresignedVendorComplianceUpload(
    vendorProfileId: string,
    fileName: string,
    contentType: string,
    fileSize: number,
  ): Promise<PresignedUploadResult> {
    const normalized = normalizeVendorDocumentContentType(contentType);
    assertValidVendorDocumentUpload(normalized, fileSize);
    const config = assertR2Config();
    const key = buildVendorComplianceObjectKey(vendorProfileId, fileName, normalized);
    const publicUrl = buildPublicUrl(config.publicUrl, key);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: normalized,
    });

    const client = getPresignS3Client();

    return getSignedUrl(client, command, {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      signableHeaders: new Set(['content-type']),
    }).then((uploadUrl) => ({
      uploadUrl,
      key,
      publicUrl,
      contentType: normalized,
      uploadHeaders: { 'Content-Type': normalized },
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    }));
  }
}

export const storageService = new StorageService();
