import { prisma } from '../../config/database.js';
import { categoriesService } from '../categories/categories.service.js';
import { catalogVersionService } from './catalog-version.service.js';
import {
  catalogOfferingCountFilter,
  vendorVisibilityFilter,
  VENDOR_FAMILY_WHERE,
  VENDOR_SERIES_WHERE,
} from './vendor-catalog.filters.js';
import type { VendorBootstrapDto } from './vendor-catalog.types.js';

const BOOTSTRAP_PRODUCT_CAP = 10_000;

function mapCategoryRef(cat: { id: string; name: string; slug: string }) {
  return { id: cat.id, name: cat.name, slug: cat.slug };
}

export class VendorBootstrapService {
  async getBootstrap(): Promise<VendorBootstrapDto> {
    const [version, categories, families, series, products] = await Promise.all([
      catalogVersionService.getVersion(),
      categoriesService.findAll(),
      this.loadFamilies(),
      this.loadSeries(),
      this.loadProducts(),
    ]);

    const staticBootstrap = { categories };
    const catalogBranch = { families, series, products };

    return {
      ...version,
      static: staticBootstrap,
      catalog: catalogBranch,
      categories,
      families,
      series,
      products,
    };
  }

  private async loadFamilies() {
    const families = await prisma.productFamily.findMany({
      where: VENDOR_FAMILY_WHERE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        series: {
          where: VENDOR_SERIES_WHERE,
          include: {
            _count: {
              select: {
                offerings: { where: catalogOfferingCountFilter() },
              },
            },
          },
        },
      },
    });

    return families.map((family) => {
      const productCount = family.series.reduce((sum, s) => sum + s._count.offerings, 0);
      return {
        id: family.id,
        categoryId: family.categoryId,
        name: family.name,
        slug: family.slug,
        description: family.description,
        imageUrl: family.imageUrl,
        sortOrder: family.sortOrder,
        seriesCount: family.series.length,
        productCount,
      };
    });
  }

  private async loadSeries() {
    const series = await prisma.productSeries.findMany({
      where: VENDOR_SERIES_WHERE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        family: { select: { categoryId: true } },
        _count: {
          select: {
            offerings: { where: catalogOfferingCountFilter() },
          },
        },
      },
    });

    return series.map((item) => ({
      id: item.id,
      familyId: item.familyId,
      categoryId: item.family.categoryId,
      name: item.name,
      slug: item.slug,
      description: item.description,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      productCount: item._count.offerings,
    }));
  }

  private async loadProducts() {
    const products = await prisma.productOffering.findMany({
      where: vendorVisibilityFilter(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: BOOTSTRAP_PRODUCT_CAP,
      include: {
        series: {
          include: {
            family: {
              include: {
                category: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });

    return products.map((product) => ({
      id: product.id,
      seriesId: product.seriesId,
      familyId: product.series.familyId,
      categoryId: product.series.family.categoryId,
      name: product.name,
      slug: product.slug,
      displayName: product.displayName,
      shortDescription: product.shortDescription,
      description: product.description,
      thumbnailUrl: product.thumbnailUrl ?? product.images[0]?.imageUrl ?? null,
      status: product.status,
      category: mapCategoryRef(product.series.family.category),
    }));
  }
}

export const vendorBootstrapService = new VendorBootstrapService();
