/**
 * Apply CORS rules to the Cloudflare R2 bucket so browsers can PUT directly via presigned URLs.
 *
 * Usage (from backend/):
 *   R2_CORS_ORIGINS=https://www.geetaprinters.in,https://geetaprinters.in,http://localhost:3000 \
 *     npx tsx scripts/configure-r2-cors.ts
 */
import { PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getS3Client, getR2Config } from '../src/services/storage/storage.provider.js';

async function main() {
  const config = getR2Config();
  if (!config) {
    console.error('R2 is not configured. Set R2_* env vars in backend/.env');
    process.exit(1);
  }

  const origins = (process.env['R2_CORS_ORIGINS'] ?? process.env['CORS_ORIGIN'] ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const client = getS3Client();

  await client.send(
    new PutBucketCorsCommand({
      Bucket: config.bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  console.log(`R2 CORS updated for bucket "${config.bucketName}"`);
  console.log('Allowed origins:', origins.join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
