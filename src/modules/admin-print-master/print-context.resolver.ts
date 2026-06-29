import type { PrintSizeStrategyType, SizeUnit } from '@prisma/client';
import { prisma } from '../../config/database.js';
import type { SizeStrategyConfig } from '../print-engine/engines/size.engine.js';
import type { PrintJobContextDto } from '../print-engine/types/print-engine.types.js';

function mapUnitCode(code: string | null | undefined): SizeUnit {
  const c = (code ?? 'MM').toUpperCase();
  if (c === 'CM') return 'CM';
  if (c === 'INCH' || c === 'IN') return 'INCH';
  if (c === 'FT' || c === 'FEET') return 'FT';
  return 'MM';
}

export class PrintContextResolver {
  async resolveForVersion(versionId: string): Promise<{
    version: NonNullable<Awaited<ReturnType<PrintContextResolver['loadVersion']>>>;
    context: PrintJobContextDto;
    sizeStrategy: SizeStrategyConfig | null;
  } | null> {
    const version = await this.loadVersion(versionId);
    if (!version) return null;

    const masterPartial = this.buildFromMasters(version);
    const enriched = await this.enrichMasterRules(masterPartial);
    const legacyStrategy = this.buildLegacySizeStrategy(version);

    const sizeStrategy = masterPartial.sizeStrategy ?? legacyStrategy;

    const context: PrintJobContextDto = {
      versionId: version.id,
      productId: version.productOffering.id,
      printProcess: version.printProcess
        ? {
            id: version.printProcess.id,
            code: version.printProcess.code,
            name: version.printProcess.name,
            pricingStrategyKey: version.printProcess.pricingStrategyKey,
          }
        : version.productPrintConfig?.printProcess
          ? {
              id: version.productPrintConfig.printProcess.id,
              code: version.productPrintConfig.printProcess.code,
              name: version.productPrintConfig.printProcess.name,
              pricingStrategyKey: version.productPrintConfig.printProcess.pricingStrategyKey,
            }
          : null,
      printSpecification:
        masterPartial.printSpecification ?? this.mapLegacyPrintSpec(version.printSpecification),
      sizeStrategy: sizeStrategy
        ? {
            strategyType: sizeStrategy.strategyType,
            config: sizeStrategy.config,
            sizes: sizeStrategy.presets,
          }
        : null,
      fileRequirements:
        masterPartial.fileRequirements.length > 0
          ? masterPartial.fileRequirements
          : version.fileRequirementsRel.map((req) => ({
              code: req.code,
              label: req.label,
              requirementType: req.requirementType,
              maxFileSizeMb: req.maxFileSizeMb,
              allowMultiple: req.allowMultiple,
              allowedFileTypes: req.allowedFileTypes.map((t) => t.fileType),
              printLayer: req.printLayer
                ? {
                    code: req.printLayer.code,
                    label: req.printLayer.label,
                    role: req.printLayer.role,
                    coverageRule: req.printLayer.coveragePricingRule
                      ? {
                          code: req.printLayer.coveragePricingRule.code,
                          coverageType: req.printLayer.coveragePricingRule.coverageType,
                          pricePerCm2: Number(req.printLayer.coveragePricingRule.pricePerCm2),
                        }
                      : undefined,
                  }
                : undefined,
            })),
      artworkRules:
        enriched.artworkRules.length > 0
          ? enriched.artworkRules
          : version.artworkRules,
      validationRules: enriched.validationRules,
      coveragePricingRules:
        enriched.coveragePricingRules.length > 0
          ? enriched.coveragePricingRules
          : version.coveragePricingRules.map((r) => ({
              ...r,
              pricePerCm2: Number(r.pricePerCm2),
              minCharge: r.minCharge ? Number(r.minCharge) : null,
              maxCharge: r.maxCharge ? Number(r.maxCharge) : null,
            })),
      pricingStrategyKey:
        version.productPrintConfig?.pricingStrategyKey ??
        version.printProcess?.pricingStrategyKey ??
        null,
    };

    return { version, context, sizeStrategy };
  }

  private async loadVersion(versionId: string) {
    return prisma.productOfferingVersion.findUnique({
      where: { id: versionId, deletedAt: null },
      include: {
        productOffering: { select: { id: true, name: true, displayName: true, slug: true, thumbnailUrl: true } },
        printProcess: true,
        sizeTemplate: {
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: { sheetSize: { include: { measurementUnit: true } } },
            },
          },
        },
        printSpecificationTemplate: true,
        productPrintConfig: {
          include: {
            printProcess: true,
            sizeTemplate: {
              include: {
                items: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                  include: { sheetSize: { include: { measurementUnit: true } } },
                },
              },
            },
            printSpecificationTemplate: true,
            fileUploadRuleTemplate: true,
          },
        },
        printSpecification: true,
        printSizeStrategy: {
          include: {
            sizeConfigurations: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          },
        },
        fileRequirementsRel: {
          orderBy: { sortOrder: 'asc' },
          include: {
            allowedFileTypes: true,
            printLayer: { include: { coveragePricingRule: true } },
          },
        },
        artworkRules: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        coveragePricingRules: { where: { isActive: true } },
      },
    });
  }

  private buildFromMasters(version: NonNullable<Awaited<ReturnType<PrintContextResolver['loadVersion']>>>) {
    const config = version.productPrintConfig;
    const sizeTemplate = version.sizeTemplate ?? config?.sizeTemplate ?? null;
    const specTemplate = version.printSpecificationTemplate ?? config?.printSpecificationTemplate ?? null;
    const fileRule = config?.fileUploadRuleTemplate ?? null;

    const sizeStrategy = sizeTemplate ? this.buildSizeStrategyFromTemplate(sizeTemplate) : null;

    const printSpecification = specTemplate
      ? {
          allowedFormats: (specTemplate.allowedFormats as string[]) ?? [],
          requiredPages: specTemplate.requiredPages,
          pageNames: (specTemplate.pageNames as string[]) ?? [],
          finishedWidthMm: specTemplate.finishedWidthMm ? Number(specTemplate.finishedWidthMm) : null,
          finishedHeightMm: specTemplate.finishedHeightMm ? Number(specTemplate.finishedHeightMm) : null,
          artworkWidthMm: specTemplate.artworkWidthMm ? Number(specTemplate.artworkWidthMm) : null,
          artworkHeightMm: specTemplate.artworkHeightMm ? Number(specTemplate.artworkHeightMm) : null,
          bleedMm: specTemplate.bleedMm ? Number(specTemplate.bleedMm) : null,
          safeAreaMm: specTemplate.safeAreaMm ? Number(specTemplate.safeAreaMm) : null,
          minDpi: specTemplate.minDpi,
          maxFileSizeMb: specTemplate.maxFileSizeMb,
          colorMode: specTemplate.colorMode,
          previewEnabled: specTemplate.previewEnabled,
          validationEnabled: specTemplate.validationEnabled,
          autoArtworkAnalysis: specTemplate.autoArtworkAnalysis,
          coverageAnalysisEnabled: specTemplate.coverageAnalysisEnabled,
          metadata: (specTemplate.metadata as Record<string, unknown>) ?? {},
          validationRules: [],
          coverageTypes: [],
        }
      : null;

    const fileRequirements = fileRule
      ? [
          {
            code: fileRule.code,
            label: fileRule.name,
            requirementType: fileRule.requirementType,
            maxFileSizeMb: fileRule.maxFileSizeMb,
            allowMultiple: fileRule.allowMultiple,
            allowedFileTypes: (fileRule.allowedFileTypes as string[]) ?? [],
          },
        ]
      : [];

    const artworkRuleIds = (config?.artworkRuleIds as string[]) ?? [];
    const validationRuleIds = (config?.validationRuleIds as string[]) ?? [];
    const coverageRuleIds = (config?.coverageRuleIds as string[]) ?? [];

    return {
      sizeStrategy,
      printSpecification,
      fileRequirements,
      artworkRules: [] as Awaited<ReturnType<PrintContextResolver['loadMasterArtworkRules']>>,
      validationRules: [] as Awaited<ReturnType<PrintContextResolver['loadMasterValidationRules']>>,
      coveragePricingRules: [] as Array<{
        code: string;
        coverageType: string;
        pricePerCm2: number;
        minCharge: number | null;
        maxCharge: number | null;
      }>,
      _ruleIds: { artworkRuleIds, validationRuleIds, coverageRuleIds },
    };
  }

  async enrichMasterRules(
    partial: ReturnType<PrintContextResolver['buildFromMasters']>,
  ): Promise<{
    artworkRules: Awaited<ReturnType<PrintContextResolver['loadMasterArtworkRules']>>;
    validationRules: Awaited<ReturnType<PrintContextResolver['loadMasterValidationRules']>>;
    coveragePricingRules: Array<{
      id: string;
      code: string;
      coverageType: string;
      pricePerCm2: number;
      minCharge: number | null;
      maxCharge: number | null;
    }>;
  }> {
    const [artworkRules, validationRules, coverageRules] = await Promise.all([
      this.loadMasterArtworkRules(partial._ruleIds.artworkRuleIds),
      this.loadMasterValidationRules(partial._ruleIds.validationRuleIds),
      this.loadMasterCoverageRules(partial._ruleIds.coverageRuleIds),
    ]);

    return {
      artworkRules,
      validationRules,
      coveragePricingRules: coverageRules.map((r) => ({
        id: r.id,
        code: r.code,
        coverageType: r.coverageType,
        pricePerCm2: Number(r.pricePerCm2),
        minCharge: r.minCharge ? Number(r.minCharge) : null,
        maxCharge: r.maxCharge ? Number(r.maxCharge) : null,
      })),
    };
  }

  private buildSizeStrategyFromTemplate(
    template: NonNullable<
      NonNullable<Awaited<ReturnType<PrintContextResolver['loadVersion']>>>['sizeTemplate']
    >,
  ): SizeStrategyConfig {
    return {
      strategyType: template.strategyType as PrintSizeStrategyType,
      config: (template.config as Record<string, unknown>) ?? {},
      presets: template.items.map((item) => {
        const sheet = item.sheetSize;
        const width = item.width ? Number(item.width) : sheet ? Number(sheet.width) : null;
        const height = item.height ? Number(item.height) : sheet ? Number(sheet.height) : null;
        const unitCode =
          item.unitCode ?? sheet?.measurementUnit?.code ?? 'MM';
        return {
          code: item.code,
          label: item.label,
          width,
          height,
          unit: mapUnitCode(unitCode),
          sheetCode: sheet?.code ?? null,
          areaCm2: width && height ? (width * height) / 100 : null,
          pricingKey: item.code,
          metadata: {},
        };
      }),
    };
  }

  private buildLegacySizeStrategy(
    version: NonNullable<Awaited<ReturnType<PrintContextResolver['loadVersion']>>>,
  ): SizeStrategyConfig | null {
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

  private mapLegacyPrintSpec(
    spec: NonNullable<
      NonNullable<Awaited<ReturnType<PrintContextResolver['loadVersion']>>>['printSpecification']
    > | null,
  ) {
    if (!spec) return null;
    return {
      allowedFormats: (spec.allowedFormats as string[]) ?? [],
      requiredPages: spec.requiredPages,
      pageNames: (spec.pageNames as string[]) ?? [],
      finishedWidthMm: spec.finishedWidthMm ? Number(spec.finishedWidthMm) : null,
      finishedHeightMm: spec.finishedHeightMm ? Number(spec.finishedHeightMm) : null,
      artworkWidthMm: spec.artworkWidthMm ? Number(spec.artworkWidthMm) : null,
      artworkHeightMm: spec.artworkHeightMm ? Number(spec.artworkHeightMm) : null,
      bleedMm: spec.bleedMm ? Number(spec.bleedMm) : null,
      safeAreaMm: spec.safeAreaMm ? Number(spec.safeAreaMm) : null,
      minDpi: spec.minDpi,
      maxFileSizeMb: spec.maxFileSizeMb,
      colorMode: spec.colorMode,
      previewEnabled: spec.previewEnabled,
      validationEnabled: true,
      autoArtworkAnalysis: true,
      coverageAnalysisEnabled: false,
      validationRules: (spec.validationRules as string[]) ?? [],
      coverageTypes: (spec.coverageTypes as string[]) ?? [],
    };
  }

  private async loadMasterArtworkRules(ids: string[]) {
    if (ids.length === 0) return [];
    return prisma.masterArtworkRule.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async loadMasterValidationRules(ids: string[]) {
    if (ids.length === 0) return [];
    return prisma.masterValidationRule.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async loadMasterCoverageRules(ids: string[]) {
    if (ids.length === 0) return [];
    return prisma.masterCoverageRule.findMany({
      where: { id: { in: ids }, deletedAt: null, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    });
  }
}

export const printContextResolver = new PrintContextResolver();
