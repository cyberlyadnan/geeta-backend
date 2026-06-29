import {
  FileRequirementType,
  ProductOfferingVersionStatus,
  ProductStatus,
  ProductVisibility,
  SupportedFileType,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import type { PrintProfile } from './print-profiles.js';
import { PRINT_PROFILES } from './print-profiles.js';
import type { AttributeField } from './attribute-profiles.js';
import { ATTRIBUTE_PROFILES, PricingAdjustmentType } from './attribute-profiles.js';

export type ProductCatalogEntry = {
  name: string;
  slug: string;
  categorySlug: string;
  familyName: string;
  familySlug: string;
  seriesName: string;
  seriesSlug: string;
  shortDescription: string;
  description?: string;
  sku?: string;
  printProfileKey: keyof typeof PRINT_PROFILES;
  attributeProfileKey: keyof typeof ATTRIBUTE_PROFILES;
  tiers: Array<{ quantity: number; basePrice: number }>;
  isFeatured?: boolean;
};

export function placeholderImage(name: string): string {
  const text = encodeURIComponent(name.slice(0, 24));
  return `https://placehold.co/600x400/0f2847/e2e8f0/png?text=${text}`;
}

/** Deterministic SKU from slug — unique per product offering */
export function makeSku(slug: string): string {
  return `GP-${slug.replace(/-/g, '').toUpperCase()}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveRuleIds(ctx: SeedContext, codes: readonly string[], map: Map<string, string>): string[] {
  return codes.map((c) => {
    const id = map.get(c);
    if (!id) throw new Error(`Missing master rule: ${c}`);
    return id;
  });
}

export async function syncVersionFileRequirement(
  prisma: PrismaClient,
  versionId: string,
  fileRule: { code: string; name: string; requirementType: FileRequirementType; maxFileSizeMb: number; allowMultiple: boolean; allowedFileTypes: string[] },
): Promise<void> {
  const requirement = await prisma.fileRequirement.upsert({
    where: {
      productOfferingVersionId_code: { productOfferingVersionId: versionId, code: fileRule.code },
    },
    update: {
      label: fileRule.name,
      requirementType: fileRule.requirementType,
      maxFileSizeMb: fileRule.maxFileSizeMb,
      allowMultiple: fileRule.allowMultiple,
    },
    create: {
      productOfferingVersionId: versionId,
      code: fileRule.code,
      label: fileRule.name,
      requirementType: fileRule.requirementType,
      maxFileSizeMb: fileRule.maxFileSizeMb,
      allowMultiple: fileRule.allowMultiple,
      sortOrder: 0,
    },
  });

  await prisma.fileRequirementFileType.deleteMany({ where: { requirementId: requirement.id } });
  for (const fileType of fileRule.allowedFileTypes) {
    const normalized = fileType.toUpperCase() as SupportedFileType;
    if (!Object.values(SupportedFileType).includes(normalized)) continue;
    await prisma.fileRequirementFileType.create({
      data: { requirementId: requirement.id, fileType: normalized },
    });
  }
}

async function ensureAttributes(
  prisma: PrismaClient,
  versionId: string,
  fields: AttributeField[],
): Promise<void> {
  for (const [fieldIdx, field] of fields.entries()) {
    const configField = await prisma.configurationField.upsert({
      where: { productOfferingVersionId_code: { productOfferingVersionId: versionId, code: field.code } },
      update: { label: field.label, fieldType: field.fieldType, sortOrder: fieldIdx, isRequired: true, isVisible: true },
      create: {
        productOfferingVersionId: versionId,
        code: field.code,
        label: field.label,
        fieldType: field.fieldType,
        sortOrder: fieldIdx,
        isRequired: true,
        isVisible: true,
      },
    });

    for (const [optIdx, opt] of field.options.entries()) {
      const option = await prisma.configurationOption.upsert({
        where: { fieldId_value: { fieldId: configField.id, value: opt.value } },
        update: { label: opt.label, sortOrder: optIdx, isActive: true },
        create: {
          fieldId: configField.id,
          label: opt.label,
          value: opt.value,
          sortOrder: optIdx,
          isDefault: optIdx === 0,
          isActive: true,
        },
      });

      await prisma.configurationOptionPricing.upsert({
        where: { optionId: option.id },
        update: {
          adjustmentType: PricingAdjustmentType.FIXED,
          adjustmentValue: opt.adjustment,
          isActive: true,
        },
        create: {
          optionId: option.id,
          adjustmentType: PricingAdjustmentType.FIXED,
          adjustmentValue: opt.adjustment,
          isActive: true,
        },
      });
    }
  }
}

async function ensureTiers(
  prisma: PrismaClient,
  versionId: string,
  tiers: Array<{ quantity: number; basePrice: number }>,
): Promise<void> {
  for (const tier of tiers) {
    await prisma.quantityPricing.upsert({
      where: { productOfferingVersionId_quantity: { productOfferingVersionId: versionId, quantity: tier.quantity } },
      update: { basePrice: tier.basePrice, isActive: true },
      create: { productOfferingVersionId: versionId, quantity: tier.quantity, basePrice: tier.basePrice, isActive: true },
    });
  }
}

export async function upsertProductCatalogEntry(
  ctx: SeedContext,
  entry: ProductCatalogEntry,
  sortOrder: number,
): Promise<void> {
  const { prisma, registry } = ctx;
  const categoryId = registry.categories.get(entry.categorySlug);
  if (!categoryId) throw new Error(`Category not found: ${entry.categorySlug}`);

  const profile: PrintProfile = PRINT_PROFILES[entry.printProfileKey];
  const attributes = ATTRIBUTE_PROFILES[entry.attributeProfileKey];

  let familyId = registry.families.get(entry.familySlug);
  if (!familyId) {
    const family = await prisma.productFamily.upsert({
      where: { slug: entry.familySlug },
      update: { name: entry.familyName, categoryId, status: ProductStatus.ACTIVE, isActive: true, deletedAt: null },
      create: {
        categoryId,
        name: entry.familyName,
        slug: entry.familySlug,
        status: ProductStatus.ACTIVE,
        isActive: true,
        sortOrder: 0,
      },
    });
    familyId = family.id;
    registry.families.set(entry.familySlug, familyId);
  }

  let seriesId = registry.series.get(entry.seriesSlug);
  if (!seriesId) {
    const series = await prisma.productSeries.upsert({
      where: { slug: entry.seriesSlug },
      update: { name: entry.seriesName, familyId, status: ProductStatus.ACTIVE, isActive: true, deletedAt: null },
      create: {
        familyId,
        name: entry.seriesName,
        slug: entry.seriesSlug,
        status: ProductStatus.ACTIVE,
        isActive: true,
        sortOrder: 0,
      },
    });
    seriesId = series.id;
    registry.series.set(entry.seriesSlug, seriesId);
  }

  const sku = entry.sku ?? makeSku(entry.slug);
  const offeringData = {
    seriesId,
    name: entry.name,
    slug: entry.slug,
    displayName: entry.name,
    shortDescription: entry.shortDescription,
    description: entry.description ?? entry.shortDescription,
    sku,
    thumbnailUrl: placeholderImage(entry.name),
    status: ProductStatus.ACTIVE,
    visibility: ProductVisibility.VENDOR_ONLY,
    isFeatured: entry.isFeatured ?? false,
    isActive: true,
    sortOrder,
    deletedAt: null as Date | null,
  };

  const existingBySlug = await prisma.productOffering.findUnique({ where: { slug: entry.slug } });
  const existingBySku =
    !existingBySlug && sku ? await prisma.productOffering.findUnique({ where: { sku } }) : null;
  const existing = existingBySlug ?? existingBySku;

  const offering = existing
    ? await prisma.productOffering.update({
        where: { id: existing.id },
        data: offeringData,
      })
    : await prisma.productOffering.create({ data: offeringData });

  let version = await prisma.productOfferingVersion.findFirst({
    where: { productOfferingId: offering.id, isCurrent: true, deletedAt: null },
  });

  const processId = registry.printProcesses.get(profile.processCode);
  const sizeTemplateId = registry.sizeTemplates.get(profile.sizeTemplateCode);
  const specId = registry.printSpecifications.get(profile.specCode);

  if (!version) {
    version = await prisma.productOfferingVersion.create({
      data: {
        productOfferingId: offering.id,
        versionNumber: 1,
        versionLabel: 'v1.0-production',
        status: ProductOfferingVersionStatus.ACTIVE,
        isCurrent: true,
        publishedAt: new Date(),
        pricingProfileKey: profile.pricingStrategyKey,
        printProcessId: processId,
        sizeTemplateId,
        printSpecificationTemplateId: specId,
      },
    });
  } else {
    version = await prisma.productOfferingVersion.update({
      where: { id: version.id },
      data: {
        status: ProductOfferingVersionStatus.ACTIVE,
        pricingProfileKey: profile.pricingStrategyKey,
        printProcessId: processId,
        sizeTemplateId,
        printSpecificationTemplateId: specId,
        publishedAt: version.publishedAt ?? new Date(),
      },
    });
  }

  const fileUploadId = registry.fileUploadRules.get(profile.fileUploadCode);
  const artworkIds = resolveRuleIds(ctx, profile.artworkRuleCodes, registry.artworkRules);
  const validationIds = resolveRuleIds(ctx, profile.validationRuleCodes, registry.validationRules);
  const coverageIds = profile.coverageRuleCodes
    ? resolveRuleIds(ctx, profile.coverageRuleCodes, registry.coverageRules)
    : [];

  const fileRuleRow = await prisma.fileUploadRuleTemplate.findUnique({ where: { code: profile.fileUploadCode } });

  await prisma.productPrintConfig.upsert({
    where: { productOfferingVersionId: version.id },
    update: {
      printProcessId: processId,
      sizeTemplateId,
      printSpecificationTemplateId: specId,
      fileUploadRuleTemplateId: fileUploadId,
      artworkRuleIds: artworkIds,
      validationRuleIds: validationIds,
      coverageRuleIds: coverageIds,
      pricingStrategyKey: profile.pricingStrategyKey,
    },
    create: {
      productOfferingVersionId: version.id,
      printProcessId: processId,
      sizeTemplateId,
      printSpecificationTemplateId: specId,
      fileUploadRuleTemplateId: fileUploadId,
      artworkRuleIds: artworkIds,
      validationRuleIds: validationIds,
      coverageRuleIds: coverageIds,
      pricingStrategyKey: profile.pricingStrategyKey,
    },
  });

  if (fileRuleRow) {
    await syncVersionFileRequirement(prisma, version.id, {
      code: fileRuleRow.code,
      name: fileRuleRow.name,
      requirementType: fileRuleRow.requirementType,
      maxFileSizeMb: fileRuleRow.maxFileSizeMb ?? 100,
      allowMultiple: fileRuleRow.allowMultiple,
      allowedFileTypes: (fileRuleRow.allowedFileTypes as string[]) ?? ['PDF', 'PNG'],
    });
  }

  await ensureTiers(prisma, version.id, entry.tiers);
  await ensureAttributes(prisma, version.id, attributes);
}

export { slugify };
