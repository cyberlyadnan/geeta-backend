import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { vendorVisibilityFilter, VENDOR_FAMILY_WHERE } from './vendor-catalog.filters.js';
import type { VendorFamilyProductDto } from './vendor-catalog.types.js';

/**
 * Resolves Family → active Series → active Products into a flat list.
 * Series is an internal ERP layer and never exposed to the vendor UI.
 */
export class VendorFamilyProductsService {
  async getProductsForFamily(familyId: string): Promise<VendorFamilyProductDto[]> {
    const family = await prisma.productFamily.findFirst({
      where: { id: familyId, ...VENDOR_FAMILY_WHERE },
      select: { id: true },
    });
    if (!family) throw ApiError.notFound('Family not found');

    const products = await prisma.productOffering.findMany({
      where: {
        ...vendorVisibilityFilter(),
        series: {
          familyId,
          deletedAt: null,
          isActive: true,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        displayName: true,
        shortDescription: true,
        thumbnailUrl: true,
        status: true,
        sortOrder: true,
        series: {
          select: {
            family: {
              select: {
                category: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { imageUrl: true },
        },
        versions: {
          where: { isCurrent: true, deletedAt: null },
          take: 1,
          select: { id: true, versionNumber: true, status: true },
        },
      },
    });

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      displayName: product.displayName,
      shortDescription: product.shortDescription,
      thumbnailUrl: product.thumbnailUrl ?? product.images[0]?.imageUrl ?? null,
      status: product.status,
      sortOrder: product.sortOrder,
      category: product.series.family.category,
      defaultVersion: product.versions[0]
        ? {
            id: product.versions[0].id,
            versionNumber: product.versions[0].versionNumber,
            status: product.versions[0].status,
          }
        : null,
    }));
  }
}

export const vendorFamilyProductsService = new VendorFamilyProductsService();
