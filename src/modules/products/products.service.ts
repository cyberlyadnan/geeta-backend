import { Prisma, ProductStatus, ProductVisibility } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { categoryRepository } from '../../repositories/category.repository.js';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  priceResolverService,
  toFeet,
  buildQuantityBands,
  resolveQuantityBand,
  inferDimensionFields,
} from '../../services/pricing-engine/index.js';
import { pricingRepository, resolvePricingStrategyKey } from '../../repositories/pricing.repository.js';
import {
  mapVendorProductDetail,
  mapVendorProductListItem,
} from '../admin-products/admin-products.serialization.js';
import type { CalculatePriceInput } from '../admin-products/admin-products.validation.js';
import { buildProductSearchFilter } from './product-search.filter.js';

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
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          options: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            // Vendor order UI only needs pricing presence — tiers are resolved by pricing engine at preview.
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
      workflow: { include: { workflowTemplate: { select: { id: true, code: true, name: true } } } },
      productTypeProfile: {
        select: { designServiceMode: true, defaultDesignPrice: true },
      },
    },
  },
  images: { orderBy: { sortOrder: 'asc' }, take: 5 },
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
      ...(params?.search && { OR: buildProductSearchFilter(params.search) }),
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

  /** vendorId is omitted for anonymous/unauthenticated-shaped callers — no override lookup then. */
  async calculatePrice(input: CalculatePriceInput, vendorId?: string) {
    let versionId = input.versionId;
    if (!versionId) {
      const offering = await prisma.productOffering.findFirst({
        where: { id: input.productId, deletedAt: null, isActive: true },
        include: {
          versions: { where: { isCurrent: true, deletedAt: null }, take: 1, select: { id: true } },
        },
      });
      if (!offering?.versions[0]) {
        throw ApiError.notFound('Product not found or has no published version');
      }
      versionId = offering.versions[0].id;
    }

    const selectedSize = input.context?.selectedSize;
    const uploadedDimensions =
      selectedSize?.width != null && selectedSize?.height != null
        ? {
            widthFt: toFeet(selectedSize.width, selectedSize.unit),
            heightFt: toFeet(selectedSize.height, selectedSize.unit),
          }
        : undefined;

    const result = await priceResolverService.resolvePrice({
      versionId,
      vendorId,
      quantity: input.quantity,
      selections: input.selections,
      uploadedDimensions,
      context: input.context,
    });

    if (!result.valid) {
      throw ApiError.badRequest(result.reason ?? 'This combination is not available');
    }

    const basePriceComponent = result.lines.find((l) => l.code === 'base')?.amount ?? result.finalPrice;

    return {
      versionId: result.versionId,
      quantity: result.quantity,
      subtotal: basePriceComponent,
      adjustmentTotal: Math.round((result.finalPrice - basePriceComponent) * 100) / 100,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: result.finalPrice,
      listPrice: result.listPrice,
      overrideApplied: result.overrideApplied,
      unitPrice: result.unitPrice,
      currency: result.currency,
      lines: result.lines,
      snapshotPayload: result.snapshotPayload,
      formattedTotal: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
        result.finalPrice,
      ),
      formattedUnitPrice: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
        result.unitPrice,
      ),
    };
  }

  /**
   * Matrix-availability hint for the order wizard: which dimension-field combinations resolve to
   * `available: false` for the given quantity band. Frontend uses this to grey out sheet-size /
   * GSM options without re-deriving matrix rules itself — resolvePrice() at preview/placement
   * remains the actual gate, this is a UX convenience only.
   */
  async getMatrixAvailability(versionId: string, quantity: number) {
    const bundle = await pricingRepository.loadVersionBundle(versionId);
    if (!bundle) throw ApiError.notFound('Product version not found');

    if (resolvePricingStrategyKey(bundle) !== 'matrix') {
      return { applicable: false as const, dimensionFields: [] as string[], combinations: [] };
    }

    const dimensionFields = inferDimensionFields(bundle.priceMatrixCells);
    if (!dimensionFields) {
      return { applicable: false as const, dimensionFields: [] as string[], combinations: [] };
    }

    const band = resolveQuantityBand(buildQuantityBands(bundle.quantityPricing), quantity);

    const combinations = bundle.priceMatrixCells
      .filter((c) => !band || (c.dimensionKey as Record<string, string>)['qtyBand'] === band.label)
      .map((c) => {
        const { qtyBand: _qtyBand, ...dimensionValues } = c.dimensionKey as Record<string, string>;
        void _qtyBand;
        return {
          dimensionValues,
          available: c.available,
          unavailableReason: c.unavailableReason,
        };
      });

    return { applicable: true as const, dimensionFields, combinations };
  }
}

export const productsService = new ProductsService();
