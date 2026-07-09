import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { assertR2Config, getS3Client } from '../../../services/storage/storage.provider.js';
import {
  buildArtworkObjectKey,
  buildPublicUrl,
  isPreviewableArtwork,
  isVectorArtwork,
  normalizeArtworkContentType,
} from '../../../services/storage/storage.utils.js';
import type { ArtworkMetadataDto } from '../types/print-engine.types.js';
import type { PrintColorMode } from '@prisma/client';
import { renderPdfFirstPagePreview } from './pdf-preview.renderer.js';
import { logger } from '../../../logs/logger.js';

export interface ExtractedArtwork {
  metadata: ArtworkMetadataDto;
  previewKey?: string;
  previewUrl?: string;
  opaquePixelCount?: number;
  totalPixels?: number;
}

async function downloadObject(key: string): Promise<Buffer> {
  const config = assertR2Config();
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
  );
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error('Empty file body');
  return Buffer.from(bytes);
}

async function uploadPreview(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const config = assertR2Config();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return buildPublicUrl(config.publicUrl, key);
}

export class ArtworkMetadataExtractor {
  async extract(params: {
    fileKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    userId: string;
    versionId: string;
  }): Promise<ExtractedArtwork> {
    const ext = params.fileName.split('.').pop()?.toLowerCase() ?? 'bin';
    const format = ext.toUpperCase();

    if (isVectorArtwork(ext)) {
      return {
        metadata: {
          fileFormat: format,
          hasTransparency: false,
          rotation: 0,
          fileSizeBytes: params.fileSize,
          rawMetadata: { vector: true, previewable: false },
        },
      };
    }

    if (ext === 'pdf') {
      return this.extractPdf(params);
    }

    if (isPreviewableArtwork(ext)) {
      return this.extractRaster(params, ext);
    }

    return {
      metadata: {
        fileFormat: format,
        hasTransparency: false,
        rotation: 0,
        fileSizeBytes: params.fileSize,
        rawMetadata: { unsupportedPreview: true },
      },
    };
  }

  private async extractPdf(params: {
    fileKey: string;
    fileName: string;
    fileSize: number;
    userId: string;
    versionId: string;
  }): Promise<ExtractedArtwork> {
    const buffer = await downloadObject(params.fileKey);
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdf.getPageCount();
    const firstPage = pdf.getPage(0);
    const { width, height } = firstPage.getSize();
    const widthMm = (width / 72) * 25.4;
    const heightMm = (height / 72) * 25.4;

    let previewKey: string | undefined;
    let previewUrl: string | undefined;

    try {
      const previewBuffer = await renderPdfFirstPagePreview(buffer);
      previewKey = buildArtworkObjectKey(
        params.userId,
        params.versionId,
        `preview-${params.fileName}`,
        'image/webp',
      ).replace(/\.[^.]+$/, '.webp');
      previewUrl = await uploadPreview(previewKey, previewBuffer, 'image/webp');
    } catch (error) {
      logger.warn('PDF preview generation failed', {
        fileName: params.fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      metadata: {
        fileFormat: 'PDF',
        widthMm: Math.round(widthMm * 100) / 100,
        heightMm: Math.round(heightMm * 100) / 100,
        pageCount,
        colorMode: 'CMYK' as PrintColorMode,
        hasTransparency: false,
        rotation: 0,
        fileSizeBytes: params.fileSize,
        rawMetadata: { pdfPoints: { width, height } },
      },
      previewKey,
      previewUrl,
    };
  }

  private async extractRaster(
    params: {
      fileKey: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      userId: string;
      versionId: string;
    },
    ext: string,
  ): Promise<ExtractedArtwork> {
    const buffer = await downloadObject(params.fileKey);
    const image = sharp(buffer).rotate();
    const meta = await image.metadata();

    const widthPx = meta.width ?? 0;
    const heightPx = meta.height ?? 0;
    const dpi = meta.density ?? 300;
    const widthMm = widthPx ? (widthPx / dpi) * 25.4 : undefined;
    const heightMm = heightPx ? (heightPx / dpi) * 25.4 : undefined;
    const hasTransparency = meta.hasAlpha ?? false;

    let opaquePixelCount: number | undefined;
    let totalPixels: number | undefined;

    if (widthPx && heightPx) {
      totalPixels = widthPx * heightPx;
      try {
        const { data, info } = await image
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        let opaque = 0;
        for (let i = 3; i < data.length; i += info.channels) {
          const alpha = data[i];
          if (alpha !== undefined && alpha > 10) opaque += 1;
        }
        opaquePixelCount = opaque;
      } catch {
        opaquePixelCount = totalPixels;
      }
    }

    const previewBuffer = await sharp(buffer)
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    const previewKey = buildArtworkObjectKey(
      params.userId,
      params.versionId,
      `preview-${params.fileName}`,
      'image/webp',
    ).replace(/\.[^.]+$/, '.webp');

    const previewUrl = await uploadPreview(previewKey, previewBuffer, 'image/webp');

    return {
      metadata: {
        fileFormat: ext.toUpperCase(),
        widthPx,
        heightPx,
        widthMm: widthMm ? Math.round(widthMm * 100) / 100 : undefined,
        heightMm: heightMm ? Math.round(heightMm * 100) / 100 : undefined,
        dpi,
        pageCount: 1,
        colorMode: (meta.space === 'srgb' ? 'RGB' : 'CMYK') as PrintColorMode,
        hasTransparency,
        rotation: 0,
        fileSizeBytes: params.fileSize,
        rawMetadata: {
          channels: meta.channels,
          format: meta.format,
          orientation: meta.orientation,
        },
      },
      previewKey,
      previewUrl,
      opaquePixelCount,
      totalPixels,
    };
  }
}

export const artworkMetadataExtractor = new ArtworkMetadataExtractor();

export function detectFileFormat(fileName: string, mimeType: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase() ?? 'OTHER';
  normalizeArtworkContentType(mimeType, fileName);
  return ext;
}
