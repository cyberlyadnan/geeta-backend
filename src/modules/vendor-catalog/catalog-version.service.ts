import { createHash } from 'node:crypto';
import { prisma } from '../../config/database.js';
import type { CatalogVersionDto, CatalogVersionGroupsDto } from './vendor-catalog.types.js';

function toIso(date: Date | null | undefined): string {
  return (date ?? new Date(0)).toISOString();
}

/**
 * Version groups enable per-section refresh (future) without full catalog reload.
 * Each group maps to a domain aggregate's latest updatedAt.
 */
export class CatalogVersionService {
  async getVersionGroups(): Promise<CatalogVersionGroupsDto> {
    const [
      categoryMax,
      familyMax,
      seriesMax,
      offeringMax,
      versionMax,
      pricingMax,
      configFieldMax,
      workflowMax,
      artworkRuleMax,
    ] = await Promise.all([
      prisma.category.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productFamily.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productSeries.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productOffering.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productOfferingVersion.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.quantityPricing.aggregate({ where: { isActive: true }, _max: { updatedAt: true } }),
      prisma.configurationField.aggregate({ _max: { updatedAt: true } }),
      prisma.workflowTemplate.aggregate({ _max: { updatedAt: true } }),
      prisma.artworkRule.aggregate({ _max: { updatedAt: true } }),
    ]);

    return {
      category: toIso(categoryMax._max.updatedAt),
      family: toIso(familyMax._max.updatedAt),
      series: toIso(seriesMax._max.updatedAt),
      product: toIso(offeringMax._max.updatedAt),
      pricing: toIso(pricingMax._max.updatedAt),
      configuration: toIso(configFieldMax._max.updatedAt),
      workflow: toIso(workflowMax._max.updatedAt),
      artwork: toIso(artworkRuleMax._max.updatedAt),
      productVersion: toIso(versionMax._max.updatedAt),
    };
  }

  buildEtag(version: CatalogVersionDto): string {
    const hash = createHash('sha256').update(JSON.stringify(version.versionGroups)).digest('hex');
    return `"${hash.slice(0, 32)}"`;
  }

  async getVersion(): Promise<CatalogVersionDto> {
    const versionGroups = await this.getVersionGroups();
    const candidates = Object.values(versionGroups).map((d) => new Date(d).getTime());
    const catalogUpdatedAt = new Date(Math.max(...candidates)).toISOString();

    const payload: CatalogVersionDto = {
      catalogVersion: catalogUpdatedAt,
      catalogUpdatedAt,
      versionGroups,
    };

    return { ...payload, etag: this.buildEtag(payload) };
  }
}

export const catalogVersionService = new CatalogVersionService();
