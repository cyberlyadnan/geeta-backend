import { ProductStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { uniqueSlug } from '../../utils/slug.js';
import type {
  CreateFamilyInput,
  CreateSeriesInput,
  ListFamiliesQuery,
  ListSeriesQuery,
  ReorderCatalogInput,
  UpdateFamilyInput,
  UpdateSeriesInput,
} from './admin-products.validation.js';

function mapFamily(row: {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: ProductStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; name: string; slug: string };
  _count?: { series: number };
  series?: Array<{ _count: { offerings: number } }>;
  imageUrl?: string | null;
  imageKey?: string | null;
}) {
  const productCount =
    row.series?.reduce((sum, s) => sum + s._count.offerings, 0) ?? 0;
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl ?? null,
    imageKey: row.imageKey ?? null,
    sortOrder: row.sortOrder,
    status: row.status,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    category: row.category,
    seriesCount: row._count?.series ?? 0,
    productCount,
  };
}

function mapSeries(row: {
  id: string;
  familyId: string;
  name: string;
  slug: string;
  description: string | null;
  productCode: string | null;
  productionDays: number | null;
  notes: string | null;
  sortOrder: number;
  status: ProductStatus;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  family?: {
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    category?: { id: string; name: string; slug: string };
  };
  _count?: { offerings: number };
  imageUrl?: string | null;
  imageKey?: string | null;
}) {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl ?? null,
    imageKey: row.imageKey ?? null,
    productCode: row.productCode,
    productionDays: row.productionDays,
    notes: row.notes,
    sortOrder: row.sortOrder,
    status: row.status,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    family: row.family,
    productCount: row._count?.offerings ?? 0,
  };
}

export class AdminCatalogService {
  // ── Families ──────────────────────────────────────────────────────────

  async listFamilies(query: ListFamiliesQuery) {
    const { page, limit, search, categoryId, status } = query;
    const where = {
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.productFamily.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { series: true } },
          series: {
            where: { deletedAt: null },
            select: { _count: { select: { offerings: true } } },
          },
        },
      }),
      prisma.productFamily.count({ where }),
    ]);

    return {
      items: items.map(mapFamily),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getFamily(id: string) {
    const row = await prisma.productFamily.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { series: true } },
        series: {
          where: { deletedAt: null },
          select: { _count: { select: { offerings: true } } },
        },
      },
    });
    if (!row) throw ApiError.notFound('Family not found');
    return mapFamily(row);
  }

  async createFamily(input: CreateFamilyInput) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, deletedAt: null },
    });
    if (!category) throw ApiError.badRequest('Category not found');

    const slug =
      input.slug?.trim() ||
      (await uniqueSlug(input.name, async (s) =>
        !!(await prisma.productFamily.findUnique({ where: { slug: s } })),
      ));

    const existing = await prisma.productFamily.findUnique({ where: { slug } });
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict('Family slug already exists');
    }

    const row = await prisma.productFamily.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        slug,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        imageKey: input.imageKey ?? null,
        sortOrder: input.sortOrder ?? 0,
        status: input.status ?? ProductStatus.ACTIVE,
        isActive: input.status !== ProductStatus.ARCHIVED && input.status !== ProductStatus.INACTIVE,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { series: true } },
        series: { select: { _count: { select: { offerings: true } } } },
      },
    });
    return mapFamily(row);
  }

  async updateFamily(id: string, input: UpdateFamilyInput) {
    const existing = await prisma.productFamily.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw ApiError.notFound('Family not found');

    if (input.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, deletedAt: null },
      });
      if (!category) throw ApiError.badRequest('Category not found');
    }

    if (input.slug && input.slug !== existing.slug) {
      const clash = await prisma.productFamily.findUnique({ where: { slug: input.slug } });
      if (clash && clash.id !== id && !clash.deletedAt) {
        throw ApiError.conflict('Family slug already exists');
      }
    }

    const status = input.status ?? existing.status;
    const row = await prisma.productFamily.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.status !== undefined
          ? {
              status,
              isActive: status !== ProductStatus.ARCHIVED && status !== ProductStatus.INACTIVE,
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { series: true } },
        series: {
          where: { deletedAt: null },
          select: { _count: { select: { offerings: true } } },
        },
      },
    });
    return mapFamily(row);
  }

  async deleteFamily(id: string) {
    const existing = await prisma.productFamily.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { series: true } } },
    });
    if (!existing) throw ApiError.notFound('Family not found');
    if (existing._count.series > 0) {
      throw ApiError.badRequest('Cannot delete family with series. Archive or move series first.');
    }
    await prisma.productFamily.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED },
    });
    return { id };
  }

  async reorderFamilies(input: ReorderCatalogInput) {
    await prisma.$transaction(
      input.items.map((item) =>
        prisma.productFamily.updateMany({
          where: { id: item.id, deletedAt: null },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { success: true };
  }

  // ── Series ────────────────────────────────────────────────────────────

  async listSeries(query: ListSeriesQuery) {
    const { page, limit, search, familyId, categoryId, status } = query;
    const where = {
      deletedAt: null,
      ...(familyId ? { familyId } : {}),
      ...(categoryId ? { family: { categoryId, deletedAt: null } } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.productSeries.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          family: {
            select: {
              id: true,
              name: true,
              slug: true,
              categoryId: true,
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          _count: { select: { offerings: true } },
        },
      }),
      prisma.productSeries.count({ where }),
    ]);

    return {
      items: items.map(mapSeries),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async getSeries(id: string) {
    const row = await prisma.productSeries.findFirst({
      where: { id, deletedAt: null },
      include: {
        family: {
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { offerings: true } },
      },
    });
    if (!row) throw ApiError.notFound('Series not found');
    return mapSeries(row);
  }

  async createSeries(input: CreateSeriesInput) {
    const family = await prisma.productFamily.findFirst({
      where: { id: input.familyId, deletedAt: null },
    });
    if (!family) throw ApiError.badRequest('Family not found');

    const slug =
      input.slug?.trim() ||
      (await uniqueSlug(input.name, async (s) =>
        !!(await prisma.productSeries.findUnique({ where: { slug: s } })),
      ));

    const existing = await prisma.productSeries.findUnique({ where: { slug } });
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict('Series slug already exists');
    }

    const row = await prisma.productSeries.create({
      data: {
        familyId: input.familyId,
        name: input.name,
        slug,
        description: input.description ?? null,
        productCode: input.productCode ?? null,
        productionDays: input.productionDays ?? null,
        notes: input.notes ?? null,
        sortOrder: input.sortOrder ?? 0,
        status: input.status ?? ProductStatus.ACTIVE,
        isActive: input.status !== ProductStatus.ARCHIVED && input.status !== ProductStatus.INACTIVE,
      },
      include: {
        family: {
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { offerings: true } },
      },
    });
    return mapSeries(row);
  }

  async updateSeries(id: string, input: UpdateSeriesInput) {
    const existing = await prisma.productSeries.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw ApiError.notFound('Series not found');

    if (input.familyId) {
      const family = await prisma.productFamily.findFirst({
        where: { id: input.familyId, deletedAt: null },
      });
      if (!family) throw ApiError.badRequest('Family not found');
    }

    if (input.slug && input.slug !== existing.slug) {
      const clash = await prisma.productSeries.findUnique({ where: { slug: input.slug } });
      if (clash && clash.id !== id && !clash.deletedAt) {
        throw ApiError.conflict('Series slug already exists');
      }
    }

    const status = input.status ?? existing.status;
    const row = await prisma.productSeries.update({
      where: { id },
      data: {
        ...(input.familyId !== undefined ? { familyId: input.familyId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.productCode !== undefined ? { productCode: input.productCode } : {}),
        ...(input.productionDays !== undefined ? { productionDays: input.productionDays } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.status !== undefined
          ? {
              status,
              isActive: status !== ProductStatus.ARCHIVED && status !== ProductStatus.INACTIVE,
            }
          : {}),
      },
      include: {
        family: {
          select: {
            id: true,
            name: true,
            slug: true,
            categoryId: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: { select: { offerings: true } },
      },
    });
    return mapSeries(row);
  }

  async deleteSeries(id: string) {
    const existing = await prisma.productSeries.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { offerings: true } } },
    });
    if (!existing) throw ApiError.notFound('Series not found');
    if (existing._count.offerings > 0) {
      throw ApiError.badRequest('Cannot delete series with products. Move or archive products first.');
    }
    await prisma.productSeries.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED },
    });
    return { id };
  }

  async reorderSeries(input: ReorderCatalogInput) {
    await prisma.$transaction(
      input.items.map((item) =>
        prisma.productSeries.updateMany({
          where: { id: item.id, deletedAt: null },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { success: true };
  }

  // ── Catalog explorer ──────────────────────────────────────────────────

  async getCatalogExplorer() {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        productFamilies: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            series: {
              where: { deletedAt: null },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: {
                offerings: {
                  where: { deletedAt: null },
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                  include: {
                    _count: { select: { versions: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      categories: categories.map((cat) => {
        const families = cat.productFamilies.map((family) => {
          const series = family.series.map((s) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            status: s.status,
            productCount: s.offerings.length,
            products: s.offerings.map((p) => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              status: p.status,
              versionCount: p._count.versions,
            })),
          }));
          const productCount = series.reduce((sum, s) => sum + s.productCount, 0);
          const versionCount = series.reduce(
            (sum, s) => sum + s.products.reduce((vs, p) => vs + p.versionCount, 0),
            0,
          );
          return {
            id: family.id,
            name: family.name,
            slug: family.slug,
            status: family.status,
            seriesCount: series.length,
            productCount,
            versionCount,
            series,
          };
        });
        return {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          isActive: cat.isActive,
          familyCount: families.length,
          seriesCount: families.reduce((sum, f) => sum + f.seriesCount, 0),
          productCount: families.reduce((sum, f) => sum + f.productCount, 0),
          versionCount: families.reduce((sum, f) => sum + f.versionCount, 0),
          families,
        };
      }),
    };
  }
}

export const adminCatalogService = new AdminCatalogService();
