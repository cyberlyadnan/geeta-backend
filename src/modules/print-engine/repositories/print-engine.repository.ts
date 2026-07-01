import { prisma } from '../../../config/database.js';
import type { PrintSizeStrategyType, SizeUnit } from '@prisma/client';
import type { SizeStrategyConfig } from '../engines/size.engine.js';

export class PrintEngineRepository {
  async getVersionContext(versionId: string) {
    return prisma.productOfferingVersion.findUnique({
      where: { id: versionId, deletedAt: null },
      include: {
        productOffering: { select: { id: true, name: true, slug: true } },
        printSpecification: true,
        printSizeStrategy: { include: { sizeConfigurations: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } },
        fileRequirementsRel: {
          orderBy: { sortOrder: 'asc' },
          include: {
            allowedFileTypes: true,
            printLayer: { include: { coveragePricingRule: true } },
          },
        },
        artworkRules: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        coveragePricingRules: { where: { isActive: true } },
        printLayers: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  buildSizeStrategyConfig(version: NonNullable<Awaited<ReturnType<PrintEngineRepository['getVersionContext']>>>): SizeStrategyConfig | null {
    const strategy = version.printSizeStrategy;
    if (!strategy) return null;

    return {
      strategyType: strategy.strategyType as PrintSizeStrategyType,
      config: (strategy.config as Record<string, unknown>) ?? {},
      presets: strategy.sizeConfigurations.map((s) => ({
        code: s.code,
        label: s.label,
        width: s.width ? Number(s.width) : null,
        height: s.height ? Number(s.height) : null,
        unit: s.unit as SizeUnit,
        sheetCode: s.sheetCode,
        areaCm2: s.areaCm2 ? Number(s.areaCm2) : null,
        pricingKey: s.pricingKey,
        metadata: (s.metadata as Record<string, unknown>) ?? {},
      })),
    };
  }

  async getArtworkVersionDetail(artworkVersionId: string) {
    return prisma.artworkVersion.findUnique({
      where: { id: artworkVersionId },
      include: {
        metadata: true,
        validation: true,
        coverageAnalyses: true,
        fileAsset: true,
        artworkFile: {
          include: {
            fileRequirement: true,
            printLayer: { include: { coveragePricingRule: true } },
            versions: { orderBy: { versionNumber: 'desc' }, take: 5 },
          },
        },
      },
    });
  }

  async getArtworkVersionsForOrderValidation(artworkVersionIds: string[]) {
    if (artworkVersionIds.length === 0) return [];
    return prisma.artworkVersion.findMany({
      where: { id: { in: artworkVersionIds } },
      select: {
        id: true,
        processingStatus: true,
        validation: true,
        artworkFile: {
          select: {
            ownerId: true,
            fileRequirement: { select: { code: true } },
          },
        },
      },
    });
  }

  async getOrderArtworkForProduction(orderItemId: string) {
    return prisma.orderArtwork.findMany({
      where: { orderItemId },
      include: {
        artworkFile: {
          include: {
            fileAsset: true,
            versions: { orderBy: { versionNumber: 'desc' } },
          },
        },
        pinnedVersion: {
          include: {
            artworkVersion: {
              include: {
                metadata: true,
                validation: true,
                coverageAnalyses: true,
                fileAsset: true,
              },
            },
          },
        },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }
}

export const printEngineRepository = new PrintEngineRepository();
