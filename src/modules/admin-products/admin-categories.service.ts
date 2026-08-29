import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { categoryRepository } from '../../repositories/category.repository.js';
import { uniqueSlug } from '../../utils/slug.js';
import type { CreateCategoryInput, UpdateCategoryInput } from '../admin-products/admin-products.validation.js';

type CategoryParentRow = { id: string; parentId: string | null };

export class AdminCategoriesService {
  private collectDescendantIds(categoryId: string, all: CategoryParentRow[]): Set<string> {
    const descendants = new Set<string>();
    let added = true;
    while (added) {
      added = false;
      for (const row of all) {
        if (!row.parentId) continue;
        const parentIsTarget =
          row.parentId === categoryId || descendants.has(row.parentId);
        if (parentIsTarget && !descendants.has(row.id)) {
          descendants.add(row.id);
          added = true;
        }
      }
    }
    return descendants;
  }

  private async assertValidParent(categoryId: string | null, parentId: string | null) {
    if (!parentId) return;

    if (categoryId && parentId === categoryId) {
      throw ApiError.badRequest('Category cannot be its own parent');
    }

    const parent = await prisma.category.findFirst({
      where: { id: parentId, deletedAt: null },
    });
    if (!parent) throw ApiError.badRequest('Parent category not found');

    if (!categoryId) return;

    const all = await prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, parentId: true },
    });
    const descendants = this.collectDescendantIds(categoryId, all);
    if (descendants.has(parentId)) {
      throw ApiError.badRequest('Cannot assign a subcategory as parent');
    }
  }

  async listTree() {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        parentId: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { productFamilies: true } },
      },
    });

    const roots = categories.filter((c) => !c.parentId);
    return roots.map((c) => this.mapCategoryNode(c, categories));
  }

  private mapCategoryNode(
    cat: {
      id: string;
      parentId?: string | null;
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isActive: boolean;
      children?: Array<{ id: string }>;
      _count?: { productFamilies: number };
    },
    all: Array<{
      id: string;
      parentId: string | null;
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isActive: boolean;
      _count?: { productFamilies: number };
    }>,
  ): {
    id: string;
    parentId: string | null;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    isActive: boolean;
    productFamilyCount: number;
    children: ReturnType<AdminCategoriesService['mapCategoryNode']>[];
  } {
    const children = all.filter((c) => c.parentId === cat.id);
    return {
      id: cat.id,
      parentId: cat.parentId ?? null,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.imageUrl,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      productFamilyCount: cat._count?.productFamilies ?? 0,
      children: children.map((child) => this.mapCategoryNode(child, all)),
    };
  }

  async create(input: CreateCategoryInput) {
    const slug = await uniqueSlug(input.name, async (s) =>
      !!(await prisma.category.findUnique({ where: { slug: s } })),
    );

    await this.assertValidParent(null, input.parentId ?? null);

    const category = await prisma.category.create({
      data: {
        name: input.name.trim(),
        slug,
        parentId: input.parentId ?? null,
        description: input.description?.trim() || null,
        imageUrl: input.imageUrl ?? null,
        imageKey: input.imageKey ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    categoryRepository.invalidateTree();
    return category;
  }

  async update(id: string, input: UpdateCategoryInput) {
    const existing = await prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound('Category not found');

    if (input.parentId !== undefined) {
      await this.assertValidParent(id, input.parentId);
    }

    let slug: string | undefined;
    if (input.name != null && input.name.trim() !== existing.name) {
      slug = await uniqueSlug(input.name, async (s) => {
        const found = await prisma.category.findUnique({ where: { slug: s } });
        return !!found && found.id !== id;
      });
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(input.name != null && { name: input.name.trim() }),
        ...(slug != null && { slug }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        ...(input.description !== undefined && {
          description: input.description?.trim() || null,
        }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.imageKey !== undefined && { imageKey: input.imageKey }),
        ...(input.sortOrder != null && { sortOrder: input.sortOrder }),
      },
    });

    categoryRepository.invalidateTree();
    return category;
  }

  async delete(id: string) {
    const existing = await prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            productFamilies: { where: { deletedAt: null } },
            children: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!existing) throw ApiError.notFound('Category not found');
    if (existing._count.productFamilies > 0) {
      throw ApiError.badRequest('Cannot delete category with product families');
    }
    if (existing._count.children > 0) {
      throw ApiError.badRequest('Cannot delete category with subcategories');
    }

    await prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    categoryRepository.invalidateTree();
    return { id, deleted: true };
  }

  async getCatalogTree(categoryId: string) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        productFamilies: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            sortOrder: true,
            series: {
              where: { deletedAt: null },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                productCode: true,
                offerings: {
                  where: { deletedAt: null },
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                  select: {
                    id: true,
                    name: true,
                    displayName: true,
                    slug: true,
                    status: true,
                    sku: true,
                    hsnCode: true,
                    thumbnailUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!category) throw ApiError.notFound('Category not found');

    const families = category.productFamilies.map((family) => {
      const series = family.series.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        productCode: s.productCode,
        products: s.offerings.map((p) => ({
          id: p.id,
          name: p.displayName ?? p.name,
          slug: p.slug,
          status: p.status,
          sku: p.sku,
          hsnCode: p.hsnCode,
          thumbnailUrl: p.thumbnailUrl,
        })),
        productCount: s.offerings.length,
      }));

      return {
        id: family.id,
        name: family.name,
        slug: family.slug,
        status: family.status,
        sortOrder: family.sortOrder,
        series,
        seriesCount: series.length,
        productCount: series.reduce((sum, s) => sum + s.productCount, 0),
      };
    });

    const productCount = families.reduce((sum, f) => sum + f.productCount, 0);
    const seriesCount = families.reduce((sum, f) => sum + f.seriesCount, 0);

    return {
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      families,
      stats: {
        familyCount: families.length,
        seriesCount,
        productCount,
      },
    };
  }
}

export const adminCategoriesService = new AdminCategoriesService();

export const addProductImageSchema = z.object({
  imageUrl: z.string().url(),
  imageKey: z.string().min(1),
  altText: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isThumbnail: z.boolean().optional(),
});

export type AddProductImageInput = z.infer<typeof addProductImageSchema>;

export class AdminProductImagesService {
  async add(productId: string, input: AddProductImageInput) {
    const product = await prisma.productOffering.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) throw ApiError.notFound('Product not found');

    const image = await prisma.$transaction(async (tx) => {
      if (input.isThumbnail) {
        await tx.productImage.updateMany({
          where: { productOfferingId: productId },
          data: { isThumbnail: false },
        });
        await tx.productOffering.update({
          where: { id: productId },
          data: { thumbnailUrl: input.imageUrl, thumbnailKey: input.imageKey },
        });
      }

      return tx.productImage.create({
        data: {
          productOfferingId: productId,
          imageUrl: input.imageUrl,
          imageKey: input.imageKey,
          altText: input.altText,
          sortOrder: input.sortOrder ?? 0,
          isThumbnail: input.isThumbnail ?? false,
        },
      });
    });

    return image;
  }

  async remove(productId: string, imageId: string) {
    const image = await prisma.productImage.findFirst({
      where: { id: imageId, productOfferingId: productId },
    });
    if (!image) throw ApiError.notFound('Image not found');

    await prisma.productImage.delete({ where: { id: imageId } });
    return { id: imageId, deleted: true };
  }
}

export const adminProductImagesService = new AdminProductImagesService();
