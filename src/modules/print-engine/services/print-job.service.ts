import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ActivityAction, FileRequirementType, SupportedFileType, type Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import { activityLogService } from '../../../services/activity/activity-log.service.js';
import { assertR2Config, getPresignS3Client } from '../../../services/storage/storage.provider.js';
import {
  assertValidArtworkUpload,
  buildArtworkObjectKey,
  buildPublicUrl,
  isPreviewableArtwork,
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
import { buildArtworkInspection } from '../artwork-inspection/artwork-inspection.builder.js';
import { buildInspectionContext } from '../artwork-inspection/requirements-panel.builder.js';
import { storageService } from '../../../services/storage/storage.service.js';
import type { PriceCalculationResult } from '../../../services/pricing-engine/pricing.types.js';
import type {
  ArtworkUploadSlot,
  ArtworkUploadSizeInput,
  LivePricingInput,
  PrintJobContextDto,
  SizeInput,
  ValidationLevel,
} from '../types/print-engine.types.js';

const PRESIGN_EXPIRY = 600;

type StoredArtworkSizeContext = {
  selectedSize?: ArtworkUploadSizeInput;
  resolvedSize?: { widthMm: number; heightMm: number; code?: string; label?: string };
  expectedDesignSize?: { widthMm: number; heightMm: number };
  expectedTrimSize?: { widthMm: number; heightMm: number };
};

export class PrintJobService {
  async getContext(versionId: string): Promise<PrintJobContextDto> {
    const resolved = await printContextResolver.resolveForVersion(versionId);
    if (!resolved) throw ApiError.notFound('Product version not found');

    const productName =
      resolved.version.productOffering.displayName ??
      resolved.version.productOffering.name;
    const inspectionContext = buildInspectionContext(
      resolved.context,
      productName,
      resolved.version.productOffering.displayName,
    );

    return {
      ...resolved.context,
      product: {
        name: resolved.version.productOffering.name,
        displayName: resolved.version.productOffering.displayName,
      },
      artworkInspectionContext: inspectionContext,
    };
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
      size?: ArtworkUploadSizeInput;
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
      size?: ArtworkUploadSizeInput;
    },
  ) {
    const requirement = await this.resolveUploadRequirement(input.versionId, input.requirementCode);

    const config = assertR2Config();
    const ext = input.fileName.split('.').pop()?.toLowerCase() ?? 'bin';
    const publicUrl = buildPublicUrl(config.publicUrl, input.fileKey);

    const resolved = await printContextResolver.resolveForVersion(input.versionId);
    const resolvedSize =
      resolved?.sizeStrategy && input.size && sizeEngine.canResolve(resolved.sizeStrategy, input.size)
        ? sizeEngine.resolve(resolved.sizeStrategy, input.size)
        : null;
    const bleedMm =
      resolved?.context.printSpecification?.['bleedMm'] != null
        ? Number(resolved.context.printSpecification['bleedMm'])
        : 0;
    const sizeContext: StoredArtworkSizeContext | null = resolvedSize
      ? {
          selectedSize: input.size,
          resolvedSize: {
            widthMm: resolvedSize.widthMm,
            heightMm: resolvedSize.heightMm,
            code: resolvedSize.code,
            label: resolvedSize.label,
          },
          expectedTrimSize: {
            widthMm: resolvedSize.widthMm,
            heightMm: resolvedSize.heightMm,
          },
          expectedDesignSize: {
            widthMm: resolvedSize.widthMm + bleedMm * 2,
            heightMm: resolvedSize.heightMm + bleedMm * 2,
          },
        }
      : input.size
        ? { selectedSize: input.size }
        : null;

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

      if (sizeContext) {
        await tx.artworkMetadata.create({
          data: {
            artworkVersionId: artworkVersion.id,
            fileFormat: ext.toUpperCase(),
            hasTransparency: false,
            rotation: 0,
            fileSizeBytes: input.fileSize,
            rawMetadata: ({ selectedSizeContext: sizeContext } as unknown) as Prisma.InputJsonValue,
          },
        });
      }

      return { artworkFileId, artworkVersionId: artworkVersion.id, fileAssetId: fileAsset.id };
    });

    const queued = await enqueueArtworkProcessing({
      artworkVersionId: result.artworkVersionId,
      userId,
      versionId: input.versionId,
    });

    // Return immediately — inspection runs in the worker or as a background task.
    if (queued) {
      logger.debug('Artwork queued for worker processing', {
        artworkVersionId: result.artworkVersionId,
      });
    } else {
      void artworkProcessingService
        .processArtworkVersion(result.artworkVersionId, input.versionId)
        .catch((error) => {
          logger.error('Artwork background processing failed after upload', {
            artworkVersionId: result.artworkVersionId,
            versionId: input.versionId,
            error: error instanceof Error ? error.message : String(error),
          });
          void prisma.artworkVersion
            .update({
              where: { id: result.artworkVersionId },
              data: { processingStatus: 'FAILED' },
            })
            .catch(() => undefined);
          void prisma.artworkFile
            .update({
              where: { id: result.artworkFileId },
              data: { processingStatus: 'FAILED' },
            })
            .catch(() => undefined);
        });
    }

    return result;
  }

  /**
   * Server-side upload to R2 — avoids browser CORS to Cloudflare storage (production-safe).
   */
  async uploadArtworkMultipart(
    userId: string,
    input: {
      versionId: string;
      requirementCode: string;
      filePath: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      size?: ArtworkUploadSizeInput;
    },
  ) {
    const requirement = await this.resolveUploadRequirement(input.versionId, input.requirementCode);
    const contentType = normalizeArtworkContentType(input.mimeType, input.originalName);

    assertValidArtworkUpload(
      contentType,
      input.fileSize,
      input.originalName,
      requirement.maxFileSizeMb ?? undefined,
    );

    const key = buildArtworkObjectKey(userId, input.versionId, input.originalName, contentType);

    await storageService.putArtworkObjectFromFile({
      key,
      filePath: input.filePath,
      contentType,
      fileSize: input.fileSize,
    });

    return this.registerArtwork(userId, {
      versionId: input.versionId,
      requirementCode: input.requirementCode,
      fileName: input.originalName,
      fileKey: key,
      mimeType: contentType,
      fileSize: input.fileSize,
      size: input.size,
    });
  }

  async getArtworkStatus(artworkVersionId: string, userId: string) {
    const detail = await printEngineRepository.getArtworkVersionDetail(artworkVersionId);
    if (!detail || detail.artworkFile.ownerId !== userId) {
      throw ApiError.notFound('Artwork not found');
    }

    return this.buildArtworkStatusResponse(detail);
  }

  async getArtworkStatusUnscoped(artworkVersionId: string) {
    const detail = await printEngineRepository.getArtworkVersionDetail(artworkVersionId);
    if (!detail) throw ApiError.notFound('Artwork not found');
    return this.buildArtworkStatusResponse(detail);
  }

  async enqueueArtworkProcessingForVersion(
    artworkVersionId: string,
    versionId: string,
    userId: string,
  ) {
    const queued = await enqueueArtworkProcessing({ artworkVersionId, userId, versionId });

    if (queued) {
      logger.debug('Artwork queued for worker processing', { artworkVersionId });
      return;
    }

    void artworkProcessingService.processArtworkVersion(artworkVersionId, versionId).catch((error) => {
      logger.error('Artwork background processing failed after production replace', {
        artworkVersionId,
        versionId,
        error: error instanceof Error ? error.message : String(error),
      });
      void prisma.artworkVersion
        .update({
          where: { id: artworkVersionId },
          data: { processingStatus: 'FAILED' },
        })
        .catch(() => undefined);
    });
  }

  private async buildArtworkStatusResponse(
    detail: NonNullable<Awaited<ReturnType<typeof printEngineRepository['getArtworkVersionDetail']>>>,
  ) {
    const mapped = this.mapArtworkVersion(detail);
    const versionId = detail.artworkFile.versionId;
    let inspection = null;

    if (versionId) {
      const resolved = await printContextResolver.resolveForVersion(versionId);
      if (resolved) {
        const productName =
          resolved.version.productOffering.displayName ??
          resolved.version.productOffering.name;
        const rawMetadata =
          (mapped.metadata?.rawMetadata as Record<string, unknown> | null) ?? null;
        const selectedSizeContext = rawMetadata?.['selectedSizeContext'] as StoredArtworkSizeContext | undefined;
        const inspectionContext = buildInspectionContext(
          resolved.context,
          productName,
          resolved.version.productOffering.displayName,
          {
            trimSize: selectedSizeContext?.expectedTrimSize ?? null,
            designSize: selectedSizeContext?.expectedDesignSize ?? null,
          },
        );
        inspection = buildArtworkInspection(inspectionContext, {
          previewUrl: mapped.previewUrl,
          metadata: mapped.metadata
            ? {
                fileFormat: mapped.metadata.fileFormat,
                widthPx: mapped.metadata.widthPx ?? undefined,
                heightPx: mapped.metadata.heightPx ?? undefined,
                widthMm: mapped.metadata.widthMm != null ? Number(mapped.metadata.widthMm) : undefined,
                heightMm: mapped.metadata.heightMm != null ? Number(mapped.metadata.heightMm) : undefined,
                dpi: mapped.metadata.dpi ?? undefined,
                pageCount: mapped.metadata.pageCount ?? undefined,
                colorMode: mapped.metadata.colorMode ?? undefined,
                hasTransparency: mapped.metadata.hasTransparency ?? undefined,
                fileSizeBytes: mapped.metadata.fileSizeBytes ?? undefined,
                rawMetadata: (mapped.metadata.rawMetadata as Record<string, unknown> | null) ?? undefined,
              }
            : null,
          validation: mapped.validation
            ? {
                overallLevel: mapped.validation.overallLevel,
                canProceed: mapped.validation.canProceed,
                checks: (mapped.validation.checks as Array<{
                  code: string;
                  level: ValidationLevel;
                  message: string;
                  details?: Record<string, unknown>;
                }>) ?? [],
              }
            : null,
          coverageAnalyses: mapped.coverageAnalyses?.map((c) => ({
            coverageType: c.coverageType,
            coveragePercent: c.coveragePercent,
            coverageCm2: c.coverageCm2,
            coverageMm2: c.coverageMm2,
            boundingBox: c.boundingBox as { x: number; y: number; width: number; height: number } | null,
          })),
          file: mapped.file,
          requirementLabel: detail.artworkFile.fileRequirement?.label,
          printLayerRole: detail.artworkFile.printLayer?.role ?? null,
        });
      }
    }

    return { ...mapped, inspection };
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
      previewUrl:
        detail.previewUrl ??
        (isPreviewableArtwork(detail.fileAsset.extension) &&
        detail.fileAsset.mimeType.toLowerCase().startsWith('image/')
          ? detail.fileAsset.fileUrl
          : null),
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
        fileUrl: detail.fileAsset.fileUrl,
      },
      versions: detail.artworkFile.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        processingStatus: v.processingStatus,
      })),
    };
  }

  private artworkSlotSatisfiesRequirement(
    slot: ArtworkUploadSlot,
    detail:
      | Awaited<ReturnType<typeof printEngineRepository['getArtworkVersionDetail']>>
      | Awaited<ReturnType<typeof printEngineRepository['getArtworkVersionsForOrderValidation']>>[number]
      | null
      | undefined,
    requirementCode: string,
  ): boolean {
    if (slot.requirementCode === requirementCode) return true;
    const linkedCode = detail?.artworkFile.fileRequirement?.code;
    return linkedCode === requirementCode;
  }

  private artworkValidationAllowsOrder(
    detail: {
      processingStatus: string;
    },
  ): boolean {
    return detail.processingStatus !== 'FAILED';
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

    const versionIds = slots.map((s) => s.artworkVersionId);
    const detailsList = await printEngineRepository.getArtworkVersionsForOrderValidation(versionIds);
    const detailsById = new Map(detailsList.map((d) => [d.id, d]));

    for (const req of required) {
      const satisfied = slots.some((slot) => {
        const detail = detailsById.get(slot.artworkVersionId);
        return this.artworkSlotSatisfiesRequirement(slot, detail, req.code);
      });
      if (!satisfied) {
        throw ApiError.badRequest(`Required artwork missing: ${req.label}`);
      }
    }

    const items: Array<{ artworkVersionId: string; validation: unknown }> = [];
    let canProceed = true;

    for (const slot of slots) {
      const detail = detailsById.get(slot.artworkVersionId);
      if (!detail || detail.artworkFile.ownerId !== userId) {
        throw ApiError.badRequest(`Invalid artwork: ${slot.requirementCode}`);
      }
      if (!this.artworkValidationAllowsOrder(detail)) canProceed = false;
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

    const effectiveCode = contextReq?.code ?? requirementCode;
    const template = contextReq ?? {
      code: effectiveCode,
      label: 'Main Artwork',
      requirementType: 'REQUIRED',
      maxFileSizeMb: 100,
      allowMultiple: false,
      allowedFileTypes: ['PDF', 'PNG', 'JPG', 'JPEG', 'WEBP', 'CDR'],
    };

    const version = await printEngineRepository.getVersionContext(versionId);
    let legacy = version?.fileRequirementsRel.find((r) => r.code === effectiveCode);

    if (!legacy) {
      legacy = await this.ensureLegacyFileRequirement(versionId, {
        code: effectiveCode,
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
      code: effectiveCode,
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
