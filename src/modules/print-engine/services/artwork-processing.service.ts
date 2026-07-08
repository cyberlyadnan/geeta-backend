import { prisma } from '../../../config/database.js';
import { coverageEngine } from '../engines/coverage.engine.js';
import { sizeEngine } from '../engines/size.engine.js';
import { validationEngine } from '../engines/validation.engine.js';
import { printEngineRepository } from '../repositories/print-engine.repository.js';
import { artworkMetadataExtractor } from './artwork-metadata.extractor.js';
import { printContextResolver } from '../../admin-print-master/print-context.resolver.js';
import type { PrintColorMode, ValidationLevel } from '@prisma/client';

export class ArtworkProcessingService {
  async processArtworkVersion(artworkVersionId: string, versionId: string): Promise<void> {
    const detail = await printEngineRepository.getArtworkVersionDetail(artworkVersionId);
    if (!detail) {
      await this.markFailed(artworkVersionId);
      return;
    }

    const version = await printEngineRepository.getVersionContext(versionId);
    if (!version) {
      await this.markFailed(artworkVersionId, detail.artworkFileId);
      return;
    }

    try {
    await prisma.artworkVersion.update({
      where: { id: artworkVersionId },
      data: { processingStatus: 'VALIDATING', virusScanPassed: true },
    });

    const extracted = await artworkMetadataExtractor.extract({
      fileKey: detail.fileAsset.fileKey,
      fileName: detail.fileAsset.originalName,
      mimeType: detail.fileAsset.mimeType,
      fileSize: detail.fileAsset.fileSize,
      userId: detail.artworkFile.ownerId,
      versionId,
    });

    const existingRawMetadata =
      (detail.metadata?.rawMetadata as Record<string, unknown> | null) ?? {};
    const storedSizeContext = existingRawMetadata['selectedSizeContext'] as
      | {
          selectedSize?: { sizeCode?: string; width?: number; height?: number; unit?: 'MM' | 'CM' | 'INCH' | 'FT' };
          resolvedSize?: { widthMm: number; heightMm: number };
        }
      | undefined;
    const mergedRawMetadata = {
      ...existingRawMetadata,
      ...(extracted.metadata.rawMetadata ?? {}),
      selectedSizeContext: storedSizeContext,
    };

    await prisma.artworkMetadata.upsert({
      where: { artworkVersionId },
      create: {
        artworkVersionId,
        fileFormat: extracted.metadata.fileFormat,
        widthPx: extracted.metadata.widthPx,
        heightPx: extracted.metadata.heightPx,
        widthMm: extracted.metadata.widthMm,
        heightMm: extracted.metadata.heightMm,
        dpi: extracted.metadata.dpi,
        pageCount: extracted.metadata.pageCount,
        colorMode: extracted.metadata.colorMode as PrintColorMode | undefined,
        hasTransparency: extracted.metadata.hasTransparency,
        rotation: extracted.metadata.rotation,
        fileSizeBytes: extracted.metadata.fileSizeBytes,
        rawMetadata: mergedRawMetadata as object,
      },
      update: {
        fileFormat: extracted.metadata.fileFormat,
        widthPx: extracted.metadata.widthPx,
        heightPx: extracted.metadata.heightPx,
        widthMm: extracted.metadata.widthMm,
        heightMm: extracted.metadata.heightMm,
        dpi: extracted.metadata.dpi,
        pageCount: extracted.metadata.pageCount,
        colorMode: extracted.metadata.colorMode as PrintColorMode | undefined,
        hasTransparency: extracted.metadata.hasTransparency,
        fileSizeBytes: extracted.metadata.fileSizeBytes,
        rawMetadata: mergedRawMetadata as object,
      },
    });

    if (extracted.previewKey) {
      await prisma.artworkVersion.update({
        where: { id: artworkVersionId },
        data: {
          previewKey: extracted.previewKey,
          previewUrl: extracted.previewUrl,
          processingStatus: 'ANALYZING',
        },
      });
    }

    const resolved = await printContextResolver.resolveForVersion(versionId);
    const specRecord = resolved?.context.printSpecification ?? null;
    const spec = version.printSpecification;
    const selectedSizeInput =
      storedSizeContext?.selectedSize && resolved?.sizeStrategy
        ? {
            ...storedSizeContext.selectedSize,
            strategyType: resolved.sizeStrategy.strategyType,
          }
        : undefined;
    const resolvedSize =
      resolved?.sizeStrategy && selectedSizeInput && sizeEngine.canResolve(resolved.sizeStrategy, selectedSizeInput)
        ? sizeEngine.resolve(resolved.sizeStrategy, selectedSizeInput)
        : storedSizeContext?.resolvedSize
          ? {
              label: 'Resolved upload size',
              widthMm: Number(storedSizeContext.resolvedSize.widthMm),
              heightMm: Number(storedSizeContext.resolvedSize.heightMm),
              areaCm2:
                (Number(storedSizeContext.resolvedSize.widthMm) *
                  Number(storedSizeContext.resolvedSize.heightMm)) /
                100,
            }
          : undefined;

    const validation = validationEngine.validate(
      extracted.metadata,
      {
        requiredPages: specRecord?.['requiredPages'] as number | null | undefined,
        minDpi: specRecord?.['minDpi'] as number | null | undefined,
        maxFileSizeMb: specRecord?.['maxFileSizeMb'] as number | null | undefined,
        colorMode: (specRecord?.['colorMode'] ?? spec?.colorMode) as PrintColorMode | undefined,
        artworkWidthMm: specRecord?.['artworkWidthMm']
          ? Number(specRecord['artworkWidthMm'])
          : spec?.artworkWidthMm
            ? Number(spec.artworkWidthMm)
            : null,
        artworkHeightMm: specRecord?.['artworkHeightMm']
          ? Number(specRecord['artworkHeightMm'])
          : spec?.artworkHeightMm
            ? Number(spec.artworkHeightMm)
            : null,
        bleedMm: specRecord?.['bleedMm']
          ? Number(specRecord['bleedMm'])
          : spec?.bleedMm
            ? Number(spec.bleedMm)
            : null,
        safeAreaMm: specRecord?.['safeAreaMm']
          ? Number(specRecord['safeAreaMm'])
          : spec?.safeAreaMm
            ? Number(spec.safeAreaMm)
            : null,
        allowedFormats: (specRecord?.['allowedFormats'] as string[]) ?? (spec?.allowedFormats as string[]) ?? [],
        validationRules: [],
      },
      (resolved?.context.artworkRules.length
        ? resolved.context.artworkRules
        : version.artworkRules
      ).map((r) => {
        const rule = r as {
          ruleCode?: string;
          code?: string;
          ruleType: string;
          config?: Record<string, unknown>;
          failLevel: ValidationLevel;
          message?: string | null;
        };
        return {
          ruleCode: rule.ruleCode ?? rule.code ?? 'RULE',
          ruleType: String(rule.ruleType),
          config: (rule.config as Record<string, unknown>) ?? {},
          failLevel: rule.failLevel as ValidationLevel,
          message: rule.message ?? undefined,
        };
      }),
      resolvedSize,
    );

    await prisma.artworkValidation.upsert({
      where: { artworkVersionId },
      create: {
        artworkVersionId,
        overallLevel: validation.overallLevel,
        canProceed: validation.canProceed,
        checks: validation.checks as object,
      },
      update: {
        overallLevel: validation.overallLevel,
        canProceed: validation.canProceed,
        checks: validation.checks as object,
        validatedAt: new Date(),
      },
    });

    const coverageTypes = (specRecord?.['coverageTypes'] as string[]) ?? (spec?.coverageTypes as string[]) ?? [];
    const layerRule = detail.artworkFile.printLayer?.coveragePricingRule;

    if (layerRule || coverageTypes.length > 0) {
      const type = layerRule?.coverageType ?? coverageTypes[0] ?? 'GENERIC';
      let analysis;

      if (extracted.opaquePixelCount && extracted.totalPixels && extracted.metadata.widthPx) {
        analysis = coverageEngine.analyzeFromRaster({
          coverageType: type,
          widthPx: extracted.metadata.widthPx,
          heightPx: extracted.metadata.heightPx ?? 0,
          opaquePixelCount: extracted.opaquePixelCount,
          totalPixels: extracted.totalPixels,
          widthMm: extracted.metadata.widthMm,
          heightMm: extracted.metadata.heightMm,
        });
      } else if (extracted.metadata.widthMm && extracted.metadata.heightMm) {
        analysis = coverageEngine.estimateFromDimensions({
          coverageType: type,
          widthMm: extracted.metadata.widthMm,
          heightMm: extracted.metadata.heightMm,
        });
      }

      if (analysis) {
        await prisma.coverageAnalysis.create({
          data: {
            artworkVersionId,
            coverageType: analysis.coverageType,
            coveragePercent: analysis.coveragePercent,
            coverageMm2: analysis.coverageMm2,
            coverageCm2: analysis.coverageCm2,
            boundingBox: analysis.boundingBox as object,
            printablePixels: analysis.printablePixels,
            analysisData: (analysis.analysisData ?? {}) as object,
          },
        });
      }
    }

    await prisma.artworkVersion.update({
      where: { id: artworkVersionId },
      data: { processingStatus: 'COMPLETED' },
    });

    await prisma.artworkFile.update({
      where: { id: detail.artworkFileId },
      data: { processingStatus: 'COMPLETED' },
    });
    } catch (error) {
      await this.markFailed(artworkVersionId, detail.artworkFileId);
      throw error;
    }
  }

  private async markFailed(artworkVersionId: string, artworkFileId?: string) {
    await prisma.artworkVersion.update({
      where: { id: artworkVersionId },
      data: { processingStatus: 'FAILED' },
    });
    if (artworkFileId) {
      await prisma.artworkFile.update({
        where: { id: artworkFileId },
        data: { processingStatus: 'FAILED' },
      });
    }
  }
}

export const artworkProcessingService = new ArtworkProcessingService();
