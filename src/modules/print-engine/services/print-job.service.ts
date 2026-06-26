import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ActivityAction } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { activityLogService } from '../../../services/activity/activity-log.service.js';
import { assertR2Config, getPresignS3Client } from '../../../services/storage/storage.provider.js';
import {
  assertValidArtworkUpload,
  buildArtworkObjectKey,
  buildPublicUrl,
  normalizeArtworkContentType,
} from '../../../services/storage/storage.utils.js';
import { productsService } from '../../products/products.service.js';
import { contextRepository } from '../../../repositories/context.repository.js';
import { coverageEngine } from '../engines/coverage.engine.js';
import { sizeEngine } from '../engines/size.engine.js';
import { printContextResolver } from '../../admin-print-master/print-context.resolver.js';
import { printEngineRepository } from '../repositories/print-engine.repository.js';
import { enqueueArtworkProcessing } from '../../../queues/artwork-processing.queue.js';
import { artworkProcessingService } from './artwork-processing.service.js';
import type {
  ArtworkUploadSlot,
  LivePricingInput,
  PrintJobContextDto,
  SizeInput,
} from '../types/print-engine.types.js';

const PRESIGN_EXPIRY = 600;

export class PrintJobService {
  async getContext(versionId: string): Promise<PrintJobContextDto> {
    const resolved = await printContextResolver.resolveForVersion(versionId);
    if (!resolved) throw ApiError.notFound('Product version not found');
    return resolved.context;
  }

  async resolveSize(versionId: string, input: SizeInput) {
    const resolved = await printContextResolver.resolveForVersion(versionId);
    if (!resolved) throw ApiError.notFound('Product version not found');
    const strategy = resolved.sizeStrategy;
    if (!strategy) throw ApiError.badRequest('Size strategy not configured for this product');
    return sizeEngine.resolve(strategy, input);
  }

  async createArtworkPresign(
    userId: string,
    input: {
      versionId: string;
      requirementCode: string;
      fileName: string;
      contentType: string;
      fileSize: number;
    },
  ) {
    const version = await printEngineRepository.getVersionContext(input.versionId);
    if (!version) throw ApiError.notFound('Product version not found');

    const requirement = version.fileRequirementsRel.find((r) => r.code === input.requirementCode);
    if (!requirement) throw ApiError.badRequest('Unknown file requirement');

    assertValidArtworkUpload(
      input.contentType,
      input.fileSize,
      input.fileName,
      requirement.maxFileSizeMb ?? undefined,
    );

    const contentType = normalizeArtworkContentType(input.contentType, input.fileName);
    const config = assertR2Config();
    const key = buildArtworkObjectKey(userId, input.versionId, input.fileName, contentType);

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(getPresignS3Client(), command, {
      expiresIn: PRESIGN_EXPIRY,
      signableHeaders: new Set(['content-type']),
    });

    return {
      uploadUrl,
      key,
      contentType,
      uploadHeaders: { 'Content-Type': contentType },
      expiresIn: PRESIGN_EXPIRY,
      requirementCode: input.requirementCode,
    };
  }

  async registerArtwork(
    userId: string,
    input: {
      versionId: string;
      requirementCode: string;
      fileName: string;
      fileKey: string;
      mimeType: string;
      fileSize: number;
    },
  ) {
    const version = await printEngineRepository.getVersionContext(input.versionId);
    if (!version) throw ApiError.notFound('Product version not found');

    const requirement = version.fileRequirementsRel.find((r) => r.code === input.requirementCode);
    if (!requirement) throw ApiError.badRequest('Unknown file requirement');

    const config = assertR2Config();
    const ext = input.fileName.split('.').pop()?.toLowerCase() ?? 'bin';
    const publicUrl = buildPublicUrl(config.publicUrl, input.fileKey);

    const result = await prisma.$transaction(async (tx) => {
      const fileAsset = await tx.fileAsset.create({
        data: {
          originalName: input.fileName,
          fileName: input.fileName,
          fileKey: input.fileKey,
          fileUrl: publicUrl,
          mimeType: input.mimeType,
          extension: ext,
          fileSize: input.fileSize,
          uploadedById: userId,
        },
      });

      const existing = await tx.artworkFile.findFirst({
        where: {
          ownerId: userId,
          versionId: input.versionId,
          fileRequirementId: requirement.id,
        },
      });

      let artworkFileId: string;
      let versionNumber: number;

      if (existing) {
        versionNumber = existing.currentVersion + 1;
        await tx.artworkFile.update({
          where: { id: existing.id },
          data: {
            currentVersion: versionNumber,
            processingStatus: 'PENDING',
          },
        });
        artworkFileId = existing.id;
      } else {
        versionNumber = 1;
        const created = await tx.artworkFile.create({
          data: {
            fileAssetId: fileAsset.id,
            fileRequirementId: requirement.id,
            printLayerId: requirement.printLayer?.id,
            ownerId: userId,
            versionId: input.versionId,
            currentVersion: 1,
            processingStatus: 'PENDING',
          },
        });
        artworkFileId = created.id;
      }

      const artworkVersion = await tx.artworkVersion.create({
        data: {
          artworkFileId,
          versionNumber,
          fileAssetId: fileAsset.id,
          processingStatus: 'PENDING',
        },
      });

      return { artworkFileId, artworkVersionId: artworkVersion.id, fileAssetId: fileAsset.id };
    });

    const queued = await enqueueArtworkProcessing({
      artworkVersionId: result.artworkVersionId,
      userId,
      versionId: input.versionId,
    });

    if (!queued) {
      void artworkProcessingService
        .processArtworkVersion(result.artworkVersionId, input.versionId)
        .catch(() => undefined);
    }

    return result;
  }

  async getArtworkStatus(artworkVersionId: string, userId: string) {
    const detail = await printEngineRepository.getArtworkVersionDetail(artworkVersionId);
    if (!detail || detail.artworkFile.ownerId !== userId) {
      throw ApiError.notFound('Artwork not found');
    }
    return this.mapArtworkVersion(detail);
  }

  async calculateLivePricing(userId: string, input: LivePricingInput) {
    const [priceResult, checkout, resolved] = await Promise.all([
      productsService.calculatePrice({
        productId: input.productId,
        versionId: input.versionId,
        quantity: input.quantity,
        selections: input.selections,
      }),
      contextRepository.getVendorCheckoutContext(userId),
      printContextResolver.resolveForVersion(input.versionId),
    ]);

    if (!resolved) throw ApiError.notFound('Product version not found');

    let sizeAdjustment = 0;
    if (input.size && resolved.sizeStrategy) {
      const resolvedSize = sizeEngine.resolve(resolved.sizeStrategy, input.size);
      sizeAdjustment = Number(resolvedSize.metadata?.['sizeSurcharge'] ?? 0);
    }

    let coverageAdjustment = 0;
    const coverageBreakdown: Array<{ type: string; amount: number }> = [];
    if (input.coverageResults?.length) {
      const rules = resolved.context.coveragePricingRules.map((r) => ({
        code: String(r['code']),
        coverageType: String(r['coverageType']),
        pricePerCm2: Number(r['pricePerCm2']),
        minCharge: r['minCharge'] != null ? Number(r['minCharge']) : null,
        maxCharge: r['maxCharge'] != null ? Number(r['maxCharge']) : null,
      }));
      const priced = coverageEngine.calculatePricing(input.coverageResults, rules);
      for (const p of priced) {
        coverageAdjustment += p.amount;
        coverageBreakdown.push({ type: p.coverageType, amount: p.amount });
      }
    }

    const productTotal = priceResult.grandTotal + sizeAdjustment + coverageAdjustment;

    return {
      pricing: priceResult,
      adjustments: {
        size: sizeAdjustment,
        coverage: coverageAdjustment,
        coverageBreakdown,
      },
      productTotal,
      delivery: checkout.settings,
    };
  }

  mapArtworkVersion(detail: NonNullable<Awaited<ReturnType<typeof printEngineRepository['getArtworkVersionDetail']>>>) {
    return {
      id: detail.id,
      versionNumber: detail.versionNumber,
      processingStatus: detail.processingStatus,
      previewUrl: detail.previewUrl,
      metadata: detail.metadata,
      validation: detail.validation,
      coverageAnalyses: detail.coverageAnalyses?.map((c) => ({
        ...c,
        coveragePercent: Number(c.coveragePercent),
        coverageMm2: Number(c.coverageMm2),
        coverageCm2: Number(c.coverageCm2),
      })),
      file: {
        originalName: detail.fileAsset.originalName,
        extension: detail.fileAsset.extension,
        fileSize: detail.fileAsset.fileSize,
        mimeType: detail.fileAsset.mimeType,
      },
      versions: detail.artworkFile.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        processingStatus: v.processingStatus,
      })),
    };
  }

  async validateArtworksForOrder(
    userId: string,
    versionId: string,
    slots: ArtworkUploadSlot[],
  ): Promise<{ canProceed: boolean; items: Array<{ artworkVersionId: string; validation: unknown }> }> {
    const version = await printEngineRepository.getVersionContext(versionId);
    if (!version) throw ApiError.notFound('Product version not found');

    const required = version.fileRequirementsRel.filter((r) => r.requirementType === 'REQUIRED');
    const provided = new Set(slots.map((s) => s.requirementCode));

    for (const req of required) {
      if (!provided.has(req.code)) {
        throw ApiError.badRequest(`Required artwork missing: ${req.label}`);
      }
    }

    const items = [];
    let canProceed = true;

    for (const slot of slots) {
      const detail = await printEngineRepository.getArtworkVersionDetail(slot.artworkVersionId);
      if (!detail || detail.artworkFile.ownerId !== userId) {
        throw ApiError.badRequest(`Invalid artwork: ${slot.requirementCode}`);
      }
      if (!detail.validation?.canProceed) canProceed = false;
      items.push({
        artworkVersionId: slot.artworkVersionId,
        validation: detail.validation,
      });
    }

    return { canProceed, items };
  }

  logArtworkActivity(
    userId: string,
    action: ActivityAction,
    entityId: string,
    metadata?: Record<string, unknown>,
  ) {
    activityLogService.logAsync({
      action,
      entityType: 'artwork_version',
      entityId,
      actorId: userId,
      metadata: metadata as import('@prisma/client').Prisma.InputJsonValue | undefined,
    });
  }
}

export const printJobService = new PrintJobService();
