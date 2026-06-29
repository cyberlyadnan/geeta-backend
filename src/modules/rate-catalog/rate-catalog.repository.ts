import { Prisma, ProductStatus, ProductVisibility } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { categoryRepository } from '../../repositories/category.repository.js';
import type { RateCatalogCategoriesQuery, RateCatalogProductsQuery } from './rate-catalog.validation.js';

const VENDOR_VISIBILITY: Prisma.ProductOfferingWhereInput = {
  deletedAt: null,
  isActive: true,
  status: ProductStatus.ACTIVE,
  visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY] },
  versions: {
    some: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
  },
};

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  displayName: true,
  shortDescription: true,
  thumbnailUrl: true,
  updatedAt: true,
  series: {
    select: {
      family: {
        select: {
          category: {
            select: { id: true, name: true, slug: true, parentId: true },
          },
        },
      },
    },
  },
  images: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { imageUrl: true } },
  versions: {
    where: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
    take: 1,
    select: {
      id: true,
      versionNumber: true,
      versionLabel: true,
      updatedAt: true,
      publishedAt: true,
      pricingProfileKey: true,
      printProcess: { select: { code: true, name: true, pricingStrategyKey: true } },
      productPrintConfig: {
        select: {
          pricingStrategyKey: true,
          printProcess: { select: { code: true, name: true, pricingStrategyKey: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductOfferingSelect;

function resolvePrintProcess(
  version: NonNullable<
    Prisma.ProductOfferingGetPayload<{ select: typeof PRODUCT_CARD_SELECT }>['versions'][0]
  >,
) {
  const process = version.printProcess ?? version.productPrintConfig?.printProcess ?? null;
  const strategyKey =
    version.productPrintConfig?.pricingStrategyKey ??
    version.printProcess?.pricingStrategyKey ??
    version.pricingProfileKey ??
    process?.pricingStrategyKey ??
    null;
  return { process, strategyKey };
}

export class RateCatalogRepository {
  async findCategories(query: RateCatalogCategoriesQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(query.parentId && { parentId: query.parentId }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          parentId: true,
          parent: { select: { name: true } },
          _count: {
            select: {
              productFamilies: {
                where: {
                  deletedAt: null,
                  isActive: true,
                  series: {
                    some: {
                      offerings: { some: VENDOR_VISIBILITY },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.category.count({ where }),
    ]);

    return {
      items: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        imageUrl: c.imageUrl,
        parentId: c.parentId,
        parentName: c.parent?.name ?? null,
        productCount: c._count.productFamilies,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async findProducts(query: RateCatalogProductsQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    let categoryIds: string[] | undefined;
    if (query.categoryId) {
      categoryIds = await categoryRepository.resolveTreeIds(query.categoryId);
    }

    const where: Prisma.ProductOfferingWhereInput = {
      ...VENDOR_VISIBILITY,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { shortDescription: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(categoryIds && {
        series: { family: { categoryId: { in: categoryIds } } },
      }),
      ...(query.printProcessCode && {
        versions: {
          some: {
            isCurrent: true,
            OR: [
              { printProcess: { code: query.printProcessCode } },
              { productPrintConfig: { printProcess: { code: query.printProcessCode } } },
            ],
          },
        },
      }),
      ...(query.pricingStrategyKey && {
        versions: {
          some: {
            isCurrent: true,
            OR: [
              { pricingProfileKey: query.pricingStrategyKey },
              { productPrintConfig: { pricingStrategyKey: query.pricingStrategyKey } },
              { printProcess: { pricingStrategyKey: query.pricingStrategyKey } },
            ],
          },
        },
      }),
    };

    const [products, total] = await Promise.all([
      prisma.productOffering.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: PRODUCT_CARD_SELECT,
      }),
      prisma.productOffering.count({ where }),
    ]);

    return {
      items: products
        .filter((p) => p.versions[0])
        .map((p) => {
          const version = p.versions[0]!;
          const { process, strategyKey } = resolvePrintProcess(version);
          return {
            id: p.id,
            name: p.name,
            slug: p.slug,
            displayName: p.displayName,
            shortDescription: p.shortDescription,
            thumbnailUrl: p.thumbnailUrl ?? p.images[0]?.imageUrl ?? null,
            category: p.series.family.category,
            printProcess: process ? { code: process.code, name: process.name } : null,
            pricingStrategy: strategyKey ? { key: strategyKey, label: strategyKey } : null,
            versionId: version.id,
            versionLabel: version.versionLabel,
            versionNumber: version.versionNumber,
            updatedAt: version.updatedAt.toISOString(),
            publishedAt: version.publishedAt?.toISOString() ?? null,
          };
        }),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async findProductForRates(productId: string) {
    return prisma.productOffering.findFirst({
      where: { id: productId, ...VENDOR_VISIBILITY },
      select: {
        id: true,
        name: true,
        slug: true,
        thumbnailUrl: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true } },
        series: {
          select: {
            family: {
              select: {
                category: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        },
        versions: {
          where: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            versionLabel: true,
            updatedAt: true,
            publishedAt: true,
            effectiveFrom: true,
            pricingProfileKey: true,
            printProcess: { select: { code: true, name: true, pricingStrategyKey: true } },
            productPrintConfig: {
              select: {
                pricingStrategyKey: true,
                printProcess: { select: { code: true, name: true, pricingStrategyKey: true } },
              },
            },
          },
        },
      },
    });
  }

  async findFilterOptions() {
    const [categories, processes, fields] = await Promise.all([
      prisma.category.findMany({
        where: { deletedAt: null, isActive: true, parentId: { not: null } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true },
        take: 200,
      }),
      prisma.printProcess.findMany({
        where: { deletedAt: null, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { code: true, name: true, pricingStrategyKey: true },
      }),
      prisma.configurationField.findMany({
        where: {
          isVisible: true,
          productOfferingVersion: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
        },
        distinct: ['code'],
        select: {
          code: true,
          label: true,
          options: {
            where: { isActive: true },
            select: { value: true, label: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
        take: 50,
      }),
    ]);

    const strategyKeys = new Set<string>();
    for (const p of processes) {
      if (p.pricingStrategyKey) strategyKeys.add(p.pricingStrategyKey);
    }

    return {
      categories,
      printProcesses: processes.map((p) => ({ code: p.code, name: p.name })),
      pricingStrategies: [...strategyKeys].map((key) => ({ key, label: key })),
      configurationFields: fields.map((f) => ({
        code: f.code,
        label: f.label,
        values: f.options,
      })),
    };
  }
}

export const rateCatalogRepository = new RateCatalogRepository();
