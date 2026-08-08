import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../common/errors/ApiError.js';
import type { Prisma } from '@prisma/client';

export class AdminPrintEngineService {
  async upsertPrintSpecification(
    versionId: string,
    data: Prisma.PrintSpecificationUncheckedCreateInput,
  ) {
    await this.assertVersion(versionId);
    return prisma.printSpecification.upsert({
      where: { productOfferingVersionId: versionId },
      create: { ...data, productOfferingVersionId: versionId },
      update: data,
    });
  }

  async upsertSizeStrategy(
    versionId: string,
    data: {
      strategyType: Prisma.PrintSizeStrategyCreateInput['strategyType'];
      config?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) {
    await this.assertVersion(versionId);
    return prisma.printSizeStrategy.upsert({
      where: { productOfferingVersionId: versionId },
      create: {
        productOfferingVersionId: versionId,
        strategyType: data.strategyType,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
      },
      update: {
        strategyType: data.strategyType,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
      },
    });
  }

  async createSizeConfiguration(
    strategyId: string,
    data: Prisma.SizeConfigurationUncheckedCreateInput,
  ) {
    return prisma.sizeConfiguration.create({
      data: { ...data, printSizeStrategyId: strategyId },
    });
  }

  async deleteSizeConfiguration(id: string) {
    return prisma.sizeConfiguration.delete({ where: { id } });
  }

  async createFileRequirement(
    versionId: string,
    data: {
      code: string;
      label: string;
      description?: string;
      requirementType: 'REQUIRED' | 'OPTIONAL';
      maxFileSizeMb?: number;
      allowMultiple?: boolean;
      allowedFileTypes: string[];
      /** Shared ConfigurationRule condition shape; null/undefined = always ask for this slot. */
      condition?: Record<string, unknown> | null;
      sortOrder?: number;
    },
  ) {
    await this.assertVersion(versionId);
    return prisma.$transaction(async (tx) => {
      const req = await tx.fileRequirement.create({
        data: {
          productOfferingVersionId: versionId,
          code: data.code,
          label: data.label,
          description: data.description,
          requirementType: data.requirementType,
          maxFileSizeMb: data.maxFileSizeMb,
          allowMultiple: data.allowMultiple ?? false,
          condition: (data.condition ?? undefined) as Prisma.InputJsonValue | undefined,
          sortOrder: data.sortOrder ?? 0,
        },
      });

      if (data.allowedFileTypes.length > 0) {
        await tx.fileRequirementFileType.createMany({
          data: data.allowedFileTypes.map((fileType) => ({
            requirementId: req.id,
            fileType: fileType as import('@prisma/client').SupportedFileType,
          })),
        });
      }

      return tx.fileRequirement.findUnique({
        where: { id: req.id },
        include: { allowedFileTypes: true, printLayer: true },
      });
    });
  }

  async deleteFileRequirement(id: string) {
    const existing = await prisma.fileRequirement.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('File requirement not found');
    await prisma.fileRequirement.delete({ where: { id } });
    return { id, deleted: true };
  }

  async createPrintLayer(
    versionId: string,
    data: {
      code: string;
      label: string;
      role: import('@prisma/client').PrintLayerRole;
      isRequired?: boolean;
      fileRequirementId?: string;
      coveragePricingRuleId?: string;
      sortOrder?: number;
    },
  ) {
    await this.assertVersion(versionId);
    return prisma.printLayer.create({
      data: {
        productOfferingVersionId: versionId,
        code: data.code,
        label: data.label,
        role: data.role,
        isRequired: data.isRequired ?? true,
        fileRequirementId: data.fileRequirementId,
        coveragePricingRuleId: data.coveragePricingRuleId,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async createCoveragePricingRule(
    versionId: string,
    data: {
      code: string;
      label: string;
      coverageType: string;
      pricePerCm2: number;
      minCharge?: number;
      maxCharge?: number;
      supportedFileTypes?: string[];
    },
  ) {
    await this.assertVersion(versionId);
    return prisma.coveragePricingRule.create({
      data: {
        productOfferingVersionId: versionId,
        code: data.code,
        label: data.label,
        coverageType: data.coverageType,
        pricePerCm2: data.pricePerCm2,
        minCharge: data.minCharge,
        maxCharge: data.maxCharge,
        supportedFileTypes: (data.supportedFileTypes ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  async createArtworkRule(
    versionId: string,
    data: Prisma.ArtworkRuleUncheckedCreateInput,
  ) {
    await this.assertVersion(versionId);
    return prisma.artworkRule.create({
      data: { ...data, productOfferingVersionId: versionId },
    });
  }

  async getEngineConfig(versionId: string) {
    await this.assertVersion(versionId);
    return prisma.productOfferingVersion.findUnique({
      where: { id: versionId },
      include: {
        printSpecification: true,
        printSizeStrategy: { include: { sizeConfigurations: { orderBy: { sortOrder: 'asc' } } } },
        fileRequirementsRel: { include: { allowedFileTypes: true, printLayer: true }, orderBy: { sortOrder: 'asc' } },
        printLayers: { orderBy: { sortOrder: 'asc' } },
        artworkRules: { orderBy: { sortOrder: 'asc' } },
        coveragePricingRules: true,
      },
    });
  }

  private async assertVersion(versionId: string) {
    const v = await prisma.productOfferingVersion.findUnique({
      where: { id: versionId, deletedAt: null },
      select: { id: true },
    });
    if (!v) throw ApiError.notFound('Product version not found');
  }
}

export const adminPrintEngineService = new AdminPrintEngineService();
