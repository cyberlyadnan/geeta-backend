import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';
import { ApiError } from '../../common/errors/ApiError.js';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  endpoint: string;
}

export function getR2Config(): R2Config | null {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    R2_ENDPOINT,
  } = env;

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !R2_PUBLIC_URL
  ) {
    return null;
  }

  const endpoint =
    R2_ENDPOINT ?? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucketName: R2_BUCKET_NAME,
    publicUrl: R2_PUBLIC_URL,
    endpoint,
  };
}

export function assertR2Config(): R2Config {
  const config = getR2Config();
  if (!config) {
    throw ApiError.serviceUnavailable(
      'Cloudflare R2 storage is not configured on the server. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL to backend/.env, then restart the API.',
      'STORAGE_NOT_CONFIGURED',
      {
        required: [
          'R2_ACCOUNT_ID',
          'R2_ACCESS_KEY_ID',
          'R2_SECRET_ACCESS_KEY',
          'R2_BUCKET_NAME',
          'R2_PUBLIC_URL',
        ],
      },
    );
  }
  return config;
}

function buildS3Client(config: R2Config, forPresignedUrls = false): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  /**
   * AWS SDK v3.729+ adds CRC32 checksum query params to presigned URLs by default.
   * Browser PUT cannot satisfy those → SignatureDoesNotMatch on Cloudflare R2.
   */
    ...(forPresignedUrls && {
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  });
}

let s3Client: S3Client | null = null;
let presignS3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  const config = assertR2Config();
  if (!s3Client) {
    s3Client = buildS3Client(config, false);
  }
  return s3Client;
}

/** S3 client tuned for presigned PUT URLs (no flexible checksum middleware). */
export function getPresignS3Client(): S3Client {
  const config = assertR2Config();
  if (!presignS3Client) {
    presignS3Client = buildS3Client(config, true);
  }
  return presignS3Client;
}
