import type { Prisma } from '@prisma/client';
import { decimalToNumber } from '../../utils/money.js';

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
        pricingRules: true;
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

function mapOptionPricing(pricing: { adjustmentType: string; adjustmentValue: Prisma.Decimal; isActive: boolean } | null) {
  if (!pricing) return null;
  return {
    adjustmentType: pricing.adjustmentType,
    adjustmentValue: decimalToNumber(pricing.adjustmentValue),
    isActive: pricing.isActive,
  };
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
          attributes: currentVersion.configurationFields.map((field) => ({
            id: field.id,
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            sortOrder: field.sortOrder,
            values: field.options.map((opt) => ({
              id: opt.id,
              label: opt.label,
              value: opt.value,
              sortOrder: opt.sortOrder,
              isActive: opt.isActive,
              pricing: mapOptionPricing(opt.pricing),
            })),
          })),
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
    shortDescription: product.shortDescription,
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
            values: attr.values.filter((v) => v.isActive),
          })),
        }
      : null,
  };
}
