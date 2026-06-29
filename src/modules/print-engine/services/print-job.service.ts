import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ActivityAction, FileRequirementType, SupportedFileType } from '@prisma/client';
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
import type { VendorCheckoutContext } from '../../../repositories/context.repository.js';
import { coverageEngine } from '../engines/coverage.engine.js';
import { sizeEngine } from '../engines/size.engine.js';
import { printContextResolver } from '../../admin-print-master/print-context.resolver.js';
import { printEngineRepository } from '../repositories/print-engine.repository.js';
import { logger } from '../../../logs/logger.js';
import { enqueueArtworkProcessing } from '../../../queues/artwork-processing.queue.js';
import { artworkProcessingService } from './artwork-processing.service.js';
import type { PriceCalculationResult } from '../../../services/pricing-engine/pricing.types.js';
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
    const requirement = await this.resolveUploadRequirement(input.versionId, input.requirementCode);

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
    const requirement = await this.resolveUploadRequirement(input.versionId, input.requirementCode);

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
            printLayerId: requirement.printLayerId,
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

    // Process inline so validation completes without a background worker (dev/single-node).
    // If a worker is also running, duplicate processing is harmless (idempotent upserts).
    try {
      await artworkProcessingService.processArtworkVersion(
        result.artworkVersionId,
        input.versionId,
      );
    } catch (error) {
      logger.error('Artwork processing failed after upload', {
        artworkVersionId: result.artworkVersionId,
        versionId: input.versionId,
        error: error instanceof Error ? error.message : String(error),
      });
      await prisma.artworkVersion.update({
        where: { id: result.artworkVersionId },
        data: { processingStatus: 'FAILED' },
      }).catch(() => undefined);
      await prisma.artworkFile.update({
        where: { id: result.artworkFileId },
        data: { processingStatus: 'FAILED' },
      }).catch(() => undefined);
    }

    if (queued) {
      logger.debug('Artwork also queued for worker processing', {
        artworkVersionId: result.artworkVersionId,
      });
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

    return this.buildLivePricingTotals(input, { priceResult, checkout, resolved });
  }

  buildLivePricingTotals(
    input: LivePricingInput,
    deps: {
      priceResult: PriceCalculationResult;
      checkout: VendorCheckoutContext;
      resolved: NonNullable<Awaited<ReturnType<typeof printContextResolver.resolveForVersion>>>;
    },
  ) {
    const { priceResult, checkout, resolved } = deps;

    let sizeAdjustment = 0;
    if (resolved.sizeStrategy && sizeEngine.canResolve(resolved.sizeStrategy, input.size)) {
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
    resolvedContext?: NonNullable<Awaited<ReturnType<typeof printContextResolver.resolveForVersion>>>,
  ): Promise<{ canProceed: boolean; items: Array<{ artworkVersionId: string; validation: unknown }> }> {
    const resolved = resolvedContext ?? (await printContextResolver.resolveForVersion(versionId));
    if (!resolved) throw ApiError.notFound('Product version not found');

    const required = resolved.context.fileRequirements.filter((r) => r.requirementType === 'REQUIRED');
    const provided = new Set(slots.map((s) => s.requirementCode));

    for (const req of required) {
      if (!provided.has(req.code)) {
        throw ApiError.badRequest(`Required artwork missing: ${req.label}`);
      }
    }

    const details = await Promise.all(
      slots.map((slot) => printEngineRepository.getArtworkVersionDetail(slot.artworkVersionId)),
    );

    const items: Array<{ artworkVersionId: string; validation: unknown }> = [];
    let canProceed = true;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const detail = details[i];
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

  private async resolveUploadRequirement(versionId: string, requirementCode: string) {
    const resolved = await printContextResolver.resolveForVersion(versionId);
    if (!resolved) throw ApiError.notFound('Product version not found');

    const contextReq =
      resolved.context.fileRequirements.find((r) => r.code === requirementCode) ??
      resolved.context.fileRequirements[0];

    const version = await printEngineRepository.getVersionContext(versionId);
    let legacy = version?.fileRequirementsRel.find((r) => r.code === requirementCode);

    const template = contextReq ?? {
      code: requirementCode,
      label: 'Main Artwork',
      requirementType: 'REQUIRED',
      maxFileSizeMb: 100,
      allowMultiple: false,
      allowedFileTypes: ['PDF', 'PNG', 'JPG', 'JPEG', 'WEBP', 'CDR'],
    };

    if (!legacy) {
      legacy = await this.ensureLegacyFileRequirement(versionId, {
        code: requirementCode,
        label: template.label,
        requirementType: template.requirementType,
        maxFileSizeMb: template.maxFileSizeMb,
        allowMultiple: template.allowMultiple,
        allowedFileTypes: template.allowedFileTypes,
      });
    }

    if (!legacy) {
      throw ApiError.internal('Failed to resolve file requirement');
    }

    return {
      id: legacy.id,
      code: requirementCode,
      maxFileSizeMb: template.maxFileSizeMb ?? legacy.maxFileSizeMb ?? 100,
      printLayerId: legacy.printLayer?.id ?? null,
    };
  }

  private async ensureLegacyFileRequirement(
    versionId: string,
    req: {
      code: string;
      label: string;
      requirementType: string;
      maxFileSizeMb?: number | null;
      allowMultiple?: boolean;
      allowedFileTypes?: string[];
    },
  ) {
    const existing = await prisma.fileRequirement.findUnique({
      where: {
        productOfferingVersionId_code: {
          productOfferingVersionId: versionId,
          code: req.code,
        },
      },
      include: {
        printLayer: { include: { coveragePricingRule: true } },
        allowedFileTypes: true,
      },
    });
    if (existing) return existing;

    const fileTypes = (req.allowedFileTypes ?? ['PDF', 'PNG', 'JPG']).flatMap((t) => {
      const normalized = t.toUpperCase() as SupportedFileType;
      return Object.values(SupportedFileType).includes(normalized) ? [normalized] : [];
    });

    return prisma.fileRequirement.create({
      data: {
        productOfferingVersionId: versionId,
        code: req.code,
        label: req.label,
        requirementType:
          req.requirementType === 'OPTIONAL'
            ? FileRequirementType.OPTIONAL
            : FileRequirementType.REQUIRED,
        maxFileSizeMb: req.maxFileSizeMb ?? 100,
        allowMultiple: req.allowMultiple ?? false,
        allowedFileTypes: {
          create: (fileTypes.length > 0 ? fileTypes : [SupportedFileType.PDF, SupportedFileType.PNG]).map(
            (fileType) => ({ fileType }),
          ),
        },
      },
      include: {
        printLayer: { include: { coveragePricingRule: true } },
        allowedFileTypes: true,
      },
    });
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
