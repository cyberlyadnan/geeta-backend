import type { Prisma } from '@prisma/client';
import { decimalToNumber } from '../../utils/money.js';
import { mapOptionPricingDto } from './option-pricing.mapper.js';

type ProductListRow = Prisma.ProductOfferingGetPayload<{
  include: {
    series: { include: { family: { include: { category: { include: { parent: true } } } } } };
    versions: { select: { id: true; versionNumber: true; status: true } };
    images: true;
    _count: { select: { versions: true; images: true } };
  };
}>;

type ProductDetailRow = Prisma.ProductOfferingGetPayload<{
  include: {
    series: { include: { family: { include: { category: { include: { parent: true } } } } } };
    versions: {
      include: {
        quantityPricing: true;
        configurationFields: { include: { options: { include: { pricing: true } } } };
        configurationRules: { include: { targetField: { select: { id: true; code: true; label: true } } } };
        pricingRules: true;
        fileRequirementsRel: { include: { allowedFileTypes: true } };
        productPrintConfig: {
          select: {
            pricingStrategyKey: true;
            printProcess: { select: { code: true; name: true; pricingStrategyKey: true } };
            sizeTemplate: { select: { code: true; name: true; strategyType: true } };
            printSpecificationTemplate: {
              select: {
                code: true;
                bleedMm: true;
                safeAreaMm: true;
                minDpi: true;
                maxFileSizeMb: true;
                colorMode: true;
                allowedFormats: true;
              };
            };
            fileUploadRuleTemplate: {
              select: { code: true; name: true; maxFileSizeMb: true; allowedFileTypes: true };
            };
          };
        };
        workflow: { include: { workflowTemplate: { select: { id: true; code: true; name: true } } } };
        productTypeProfile: { select: { designServiceMode: true; defaultDesignPrice: true } };
      };
    };
    images: true;
  };
}>;

function mapCategory(cat: { id: string; name: string; slug: string; parent?: { id: string; name: string } | null }) {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    parent: cat.parent ? { id: cat.parent.id, name: cat.parent.name } : null,
  };
}

function mapOptionPricing(pricing: Parameters<typeof mapOptionPricingDto>[0]) {
  return mapOptionPricingDto(pricing);
}

export function mapProductListItemToDto(product: ProductListRow) {
  const category = product.series.family.category;
  const currentVersion = product.versions[0] ?? null;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    status: product.status,
    visibility: product.visibility,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    thumbnailUrl: product.thumbnailUrl,
    sortOrder: product.sortOrder,
    category: mapCategory(category),
    currentVersion: currentVersion
      ? { id: currentVersion.id, versionNumber: currentVersion.versionNumber, status: currentVersion.status }
      : null,
    imageCount: product._count.images,
    versionCount: product._count.versions,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function mapProductDetailToDto(product: ProductDetailRow) {
  const category = product.series.family.category;
  const currentVersion = product.versions.find((v) => v.isCurrent) ?? product.versions[0] ?? null;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    description: product.description,
    shortDescription: product.shortDescription,
    status: product.status,
    visibility: product.visibility,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    thumbnailUrl: product.thumbnailUrl,
    thumbnailKey: product.thumbnailKey,
    sortOrder: product.sortOrder,
    category: mapCategory(category),
    seriesId: product.seriesId,
    series: {
      id: product.series.id,
      name: product.series.name,
      family: {
        id: product.series.family.id,
        name: product.series.family.name,
        category: mapCategory(category),
      },
    },
    images: product.images.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      imageKey: img.imageKey,
      altText: img.altText,
      sortOrder: img.sortOrder,
      isThumbnail: img.isThumbnail,
    })),
    currentVersion: currentVersion
      ? {
          id: currentVersion.id,
          versionNumber: currentVersion.versionNumber,
          versionLabel: currentVersion.versionLabel,
          status: currentVersion.status,
          isCurrent: currentVersion.isCurrent,
          quantityTiers: currentVersion.quantityPricing.map((t) => ({
            id: t.id,
            quantity: t.quantity,
            basePrice: decimalToNumber(t.basePrice),
            isActive: t.isActive,
          })),
          designServiceMode: currentVersion.productTypeProfile?.designServiceMode ?? 'NOT_OFFERED',
          /** Null means this version has no ProductTypeProfile linked — the design-service
           *  fields above are just their NOT_OFFERED/null defaults, not an editable setting. */
          productTypeProfileId: currentVersion.productTypeProfileId,
          defaultDesignPrice:
            currentVersion.productTypeProfile?.defaultDesignPrice != null
              ? decimalToNumber(currentVersion.productTypeProfile.defaultDesignPrice)
              : null,
          attributes: currentVersion.configurationFields.map((field) => ({
            id: field.id,
            code: field.code,
            label: field.label,
            description: field.description,
            fieldType: field.fieldType,
            placeholder: field.placeholder,
            isRequired: field.isRequired,
            isVisible: field.isVisible,
            isPrimary: field.isPrimary,
            relevantStepTypes: field.relevantStepTypes,
            sortOrder: field.sortOrder,
            values: field.options.map((opt) => ({
              id: opt.id,
              label: opt.label,
              value: opt.value,
              sortOrder: opt.sortOrder,
              isDefault: opt.isDefault,
              isActive: opt.isActive,
              pricing: mapOptionPricing(opt.pricing),
            })),
          })),
          configurationRules: currentVersion.configurationRules.map((rule) => ({
            id: rule.id,
            targetFieldId: rule.targetFieldId,
            targetFieldCode: rule.targetField.code,
            targetFieldLabel: rule.targetField.label,
            ruleType: rule.ruleType,
            condition: rule.condition,
            sortOrder: rule.sortOrder,
          })),
          orderConfiguration: {
            hasQuestions: currentVersion.configurationFields.length > 0,
            hasRules: currentVersion.configurationRules.length > 0,
            hasArtworkRequirements:
              currentVersion.fileRequirementsRel.length > 0 ||
              Boolean(currentVersion.productPrintConfig?.fileUploadRuleTemplate),
            pricingStrategyKey:
              currentVersion.productPrintConfig?.pricingStrategyKey ??
              currentVersion.productPrintConfig?.printProcess?.pricingStrategyKey ??
              null,
            sizeTemplate: currentVersion.productPrintConfig?.sizeTemplate ?? null,
            printSpecification: currentVersion.productPrintConfig?.printSpecificationTemplate
              ? {
                  code: currentVersion.productPrintConfig.printSpecificationTemplate.code,
                  bleedMm:
                    currentVersion.productPrintConfig.printSpecificationTemplate.bleedMm != null
                      ? Number(currentVersion.productPrintConfig.printSpecificationTemplate.bleedMm)
                      : null,
                  safeAreaMm:
                    currentVersion.productPrintConfig.printSpecificationTemplate.safeAreaMm != null
                      ? Number(currentVersion.productPrintConfig.printSpecificationTemplate.safeAreaMm)
                      : null,
                  minDpi: currentVersion.productPrintConfig.printSpecificationTemplate.minDpi,
                  maxFileSizeMb: currentVersion.productPrintConfig.printSpecificationTemplate.maxFileSizeMb,
                  colorMode: currentVersion.productPrintConfig.printSpecificationTemplate.colorMode,
                  allowedFormats: (currentVersion.productPrintConfig.printSpecificationTemplate
                    .allowedFormats as string[]) ?? [],
                }
              : null,
            fileRequirements: currentVersion.fileRequirementsRel.map((r) => ({
              id: r.id,
              code: r.code,
              label: r.label,
              requirementType: r.requirementType,
              maxFileSizeMb: r.maxFileSizeMb,
              allowMultiple: r.allowMultiple,
              allowedFileTypes: r.allowedFileTypes.map((t) => t.fileType),
            })),
            workflow: currentVersion.workflow?.workflowTemplate
              ? {
                  id: currentVersion.workflow.workflowTemplate.id,
                  code: currentVersion.workflow.workflowTemplate.code,
                  name: currentVersion.workflow.workflowTemplate.name,
                }
              : null,
            softArtworkValidation: true,
          },
          pricingRules: currentVersion.pricingRules.map((rule) => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            configurationFieldId: rule.configurationFieldId,
            configurationOptionId: rule.configurationOptionId,
            adjustmentType: rule.adjustmentType,
            adjustmentValue: decimalToNumber(rule.adjustmentValue),
            priority: rule.priority,
            status: rule.status,
            condition: rule.condition,
          })),
        }
      : null,
    versions: product.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      versionLabel: v.versionLabel,
      status: v.status,
      isCurrent: v.isCurrent,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function mapVendorProductListItem(product: ProductListRow) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    displayName: product.displayName,
    shortDescription: product.shortDescription,
    description: product.description,
    thumbnailUrl: product.thumbnailUrl ?? product.images[0]?.imageUrl ?? null,
    category: mapCategory(product.series.family.category),
    status: product.status,
  };
}

export function mapVendorProductDetail(product: ProductDetailRow) {
  const base = mapProductDetailToDto(product);
  return {
    ...base,
    currentVersion: base.currentVersion
      ? {
          ...base.currentVersion,
          attributes: base.currentVersion.attributes.map((attr) => ({
            ...attr,
            values: attr.values
              .filter((v) => v.isActive)
              .map((v) => ({
                ...v,
                // Slim option pricing for vendor order UX — money is computed by preview API.
                pricing: v.pricing
                  ? {
                      pricingStrategy: v.pricing.pricingStrategy,
                      adjustmentType: v.pricing.adjustmentType,
                      adjustmentValue: v.pricing.adjustmentValue,
                      strategyConfig: {},
                      isActive: v.pricing.isActive,
                      quantityTiers: [],
                    }
                  : null,
              })),
          })),
        }
      : null,
  };
}
