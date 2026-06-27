import { prisma } from '../../../config/database.js';
import { coverageEngine } from '../engines/coverage.engine.js';
import { validationEngine } from '../engines/validation.engine.js';
import { printEngineRepository } from '../repositories/print-engine.repository.js';
import { artworkMetadataExtractor } from './artwork-metadata.extractor.js';
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
        rawMetadata: (extracted.metadata.rawMetadata ?? {}) as object,
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
        rawMetadata: (extracted.metadata.rawMetadata ?? {}) as object,
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

    const spec = version.printSpecification;
    const validation = validationEngine.validate(
      extracted.metadata,
      {
        requiredPages: spec?.requiredPages,
        minDpi: spec?.minDpi,
        maxFileSizeMb: spec?.maxFileSizeMb,
        colorMode: spec?.colorMode,
        artworkWidthMm: spec?.artworkWidthMm ? Number(spec.artworkWidthMm) : null,
        artworkHeightMm: spec?.artworkHeightMm ? Number(spec.artworkHeightMm) : null,
        bleedMm: spec?.bleedMm ? Number(spec.bleedMm) : null,
        allowedFormats: (spec?.allowedFormats as string[]) ?? [],
        validationRules: [],
      },
      version.artworkRules.map((r) => ({
        ruleCode: r.ruleCode,
        ruleType: r.ruleType,
        config: (r.config as Record<string, unknown>) ?? {},
        failLevel: r.failLevel as ValidationLevel,
        message: r.message,
      })),
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

    const coverageTypes = (spec?.coverageTypes as string[]) ?? [];
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
