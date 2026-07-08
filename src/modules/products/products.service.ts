import { Prisma, ProductStatus, ProductVisibility } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { categoryRepository } from '../../repositories/category.repository.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { pricingEngineService } from '../../services/pricing-engine/index.js';
import {
  mapVendorProductDetail,
  mapVendorProductListItem,
} from '../admin-products/admin-products.serialization.js';
import type { CalculatePriceInput } from '../admin-products/admin-products.validation.js';

const VENDOR_LIST_INCLUDE = {
  series: {
    include: {
      family: { include: { category: { include: { parent: true } } } },
    },
  },
  versions: {
    where: { isCurrent: true, deletedAt: null },
    take: 1,
    select: { id: true, versionNumber: true, status: true },
  },
  images: { orderBy: { sortOrder: 'asc' }, take: 3 },
  _count: { select: { versions: true, images: true } },
} satisfies Prisma.ProductOfferingInclude;

const VENDOR_DETAIL_INCLUDE = {
  series: {
    include: {
      family: { include: { category: { include: { parent: true } } } },
    },
  },
  versions: {
    where: { isCurrent: true, deletedAt: null },
    take: 1,
    include: {
      quantityPricing: { where: { isActive: true }, orderBy: { quantity: 'asc' } },
      configurationFields: {
        orderBy: { sortOrder: 'asc' },
        include: {
          options: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { pricing: true },
          },
        },
      },
      configurationRules: {
        orderBy: { sortOrder: 'asc' },
        include: { targetField: { select: { id: true, code: true, label: true } } },
      },
      pricingRules: { where: { status: 'ACTIVE' }, orderBy: [{ priority: 'desc' }] },
      fileRequirementsRel: {
        orderBy: { sortOrder: 'asc' },
        include: { allowedFileTypes: true },
      },
      productPrintConfig: {
        select: {
          pricingStrategyKey: true,
          printProcess: { select: { code: true, name: true, pricingStrategyKey: true } },
          sizeTemplate: { select: { code: true, name: true, strategyType: true } },
          printSpecificationTemplate: {
            select: {
              code: true,
              bleedMm: true,
              safeAreaMm: true,
              minDpi: true,
              maxFileSizeMb: true,
              colorMode: true,
              allowedFormats: true,
            },
          },
          fileUploadRuleTemplate: {
            select: { code: true, name: true, maxFileSizeMb: true, allowedFileTypes: true },
          },
        },
      },
      workflow: { include: { workflowTemplate: { select: { code: true, name: true } } } },
    },
  },
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductOfferingInclude;

export class ProductsService {
  /** Products vendors can browse/order (product Active is enough; version may still be draft). */
  private vendorVisibilityFilter(): Prisma.ProductOfferingWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      status: ProductStatus.ACTIVE,
      visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY] },
      versions: {
        some: { isCurrent: true, deletedAt: null },
      },
    };
  }

  /** Lighter filter for family/series product counts (any non-deleted offering). */
  private catalogOfferingCountFilter(): Prisma.ProductOfferingWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
      visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY, ProductVisibility.HIDDEN] },
    };
  }

  async findAll(params?: {
    search?: string;
    categoryId?: string;
    familyId?: string;
    seriesId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    let categoryIds: string[] | undefined;
    if (params?.categoryId && !params.familyId && !params.seriesId) {
      categoryIds = await categoryRepository.resolveTreeIds(params.categoryId);
    }

    const where: Prisma.ProductOfferingWhereInput = {
      ...this.vendorVisibilityFilter(),
      ...(params?.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { shortDescription: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
      ...(params?.seriesId
        ? { seriesId: params.seriesId }
        : params?.familyId
          ? { series: { familyId: params.familyId, deletedAt: null, isActive: true } }
          : categoryIds
            ? { series: { family: { categoryId: { in: categoryIds }, deletedAt: null }, deletedAt: null } }
            : {}),
    };

    const [items, total] = await Promise.all([
      prisma.productOffering.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: VENDOR_LIST_INCLUDE,
      }),
      prisma.productOffering.count({ where }),
    ]);

    return {
      items: items.map(mapVendorProductListItem),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const product = await prisma.productOffering.findFirst({
      where: { id, ...this.vendorVisibilityFilter() },
      include: VENDOR_DETAIL_INCLUDE,
    });
    if (!product?.versions[0]) throw ApiError.notFound('Product not found');

    return mapVendorProductDetail(product);
  }

  /** Vendor browse: all active families under a category. */
  async listFamilies(categoryId: string) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null, isActive: true },
    });
    if (!category) throw ApiError.notFound('Category not found');

    const families = await prisma.productFamily.findMany({
      where: {
        categoryId,
        deletedAt: null,
        isActive: true,
        status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        series: {
          where: {
            deletedAt: null,
            isActive: true,
            status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
          },
          include: {
            _count: {
              select: {
                offerings: {
                  where: this.catalogOfferingCountFilter(),
                },
              },
            },
          },
        },
      },
    });

    return {
      items: families.map((f) => {
        const productCount = f.series.reduce((sum, s) => sum + s._count.offerings, 0);
        return {
          id: f.id,
          categoryId: f.categoryId,
          name: f.name,
          slug: f.slug,
          description: f.description,
          imageUrl: f.imageUrl,
          sortOrder: f.sortOrder,
          seriesCount: f.series.length,
          productCount,
        };
      }),
    };
  }

  /** Vendor browse: all active series under a family. */
  async listSeries(familyId: string) {
    const family = await prisma.productFamily.findFirst({
      where: { id: familyId, deletedAt: null, isActive: true },
    });
    if (!family) throw ApiError.notFound('Family not found');

    const series = await prisma.productSeries.findMany({
      where: {
        familyId,
        deletedAt: null,
        isActive: true,
        status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            offerings: {
              where: this.catalogOfferingCountFilter(),
            },
          },
        },
      },
    });

    return {
      items: series.map((s) => ({
        id: s.id,
        familyId: s.familyId,
        name: s.name,
        slug: s.slug,
        description: s.description,
        imageUrl: s.imageUrl,
        sortOrder: s.sortOrder,
        productCount: s._count.offerings,
      })),
    };
  }

  async calculatePrice(input: CalculatePriceInput) {
    let result;
    if (input.versionId) {
      result = await pricingEngineService.calculate({
        versionId: input.versionId,
        quantity: input.quantity,
        selections: input.selections,
      });
    } else {
      result = await pricingEngineService.calculateForProduct(
        input.productId!,
        input.quantity,
        input.selections,
      );
    }

    return {
      ...result,
      formattedTotal: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
        result.grandTotal,
      ),
      formattedUnitPrice: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
        result.unitPrice,
      ),
    };
  }
}

export const productsService = new ProductsService();
