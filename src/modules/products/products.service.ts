import { Prisma, ProductStatus, ProductVisibility } from '@prisma/client';
import { prisma } from '../../config/database.js';
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
        where: { isVisible: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          options: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { pricing: true },
          },
        },
      },
      pricingRules: { where: { status: 'ACTIVE' }, orderBy: [{ priority: 'desc' }] },
    },
  },
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductOfferingInclude;

export class ProductsService {
  private vendorVisibilityFilter(): Prisma.ProductOfferingWhereInput {
    return {
      deletedAt: null,
      isActive: true,
      status: ProductStatus.ACTIVE,
      visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY] },
      versions: {
        some: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
      },
    };
  }

  async findAll(params?: { search?: string; categoryId?: string; page?: number; limit?: number }) {
    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ProductOfferingWhereInput = {
      ...this.vendorVisibilityFilter(),
      ...(params?.search && {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' } },
          { shortDescription: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
      ...(params?.categoryId && {
        series: { family: { categoryId: params.categoryId } },
      }),
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
