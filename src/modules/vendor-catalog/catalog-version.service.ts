import { prisma } from '../../config/database.js';
import type { CatalogVersionDto } from './vendor-catalog.types.js';

/**
 * Catalog version is derived from the latest `updatedAt` across vendor-relevant
 * catalog entities. Admin mutations automatically bump these timestamps.
 */
export class CatalogVersionService {
  async getVersion(): Promise<CatalogVersionDto> {
    const [
      categoryMax,
      familyMax,
      seriesMax,
      offeringMax,
      versionMax,
    ] = await Promise.all([
      prisma.category.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productFamily.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productSeries.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productOffering.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
      prisma.productOfferingVersion.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
    ]);

    const candidates = [
      categoryMax._max.updatedAt,
      familyMax._max.updatedAt,
      seriesMax._max.updatedAt,
      offeringMax._max.updatedAt,
      versionMax._max.updatedAt,
    ].filter((d): d is Date => d != null);

    const catalogUpdatedAt = (
      candidates.length > 0
        ? new Date(Math.max(...candidates.map((d) => d.getTime())))
        : new Date(0)
    ).toISOString();

    return {
      catalogVersion: catalogUpdatedAt,
      catalogUpdatedAt,
    };
  }
}

export const catalogVersionService = new CatalogVersionService();
