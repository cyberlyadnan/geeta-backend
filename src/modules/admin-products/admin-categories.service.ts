import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { uniqueSlug } from '../../utils/slug.js';
import type { CreateCategoryInput, UpdateCategoryInput } from '../admin-products/admin-products.validation.js';

export class AdminCategoriesService {
  async listTree() {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        _count: { select: { productFamilies: true } },
      },
    });

    const roots = categories.filter((c) => !c.parentId);
    return roots.map((c) => this.mapCategoryNode(c, categories));
  }

  private mapCategoryNode(
    cat: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isActive: boolean;
      children?: Array<{ id: string }>;
      _count?: { productFamilies: number };
    },
    all: Array<{ id: string; parentId: string | null; name: string; slug: string; description: string | null; imageUrl: string | null; sortOrder: number; isActive: boolean; _count?: { productFamilies: number } }>,
  ): {
    id: string;
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

    if (input.parentId) {
      const parent = await prisma.category.findFirst({
        where: { id: input.parentId, deletedAt: null },
      });
      if (!parent) throw ApiError.badRequest('Parent category not found');
    }

    const category = await prisma.category.create({
      data: {
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
        description: input.description,
        imageUrl: input.imageUrl,
        imageKey: input.imageKey,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    return category;
  }

  async update(id: string, input: UpdateCategoryInput) {
    const existing = await prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound('Category not found');

    if (input.parentId === id) throw ApiError.badRequest('Category cannot be its own parent');

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(input.name != null && { name: input.name }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.imageKey !== undefined && { imageKey: input.imageKey }),
        ...(input.sortOrder != null && { sortOrder: input.sortOrder }),
      },
    });

    return category;
  }

  async delete(id: string) {
    const existing = await prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { productFamilies: true, children: true } } },
    });
    if (!existing) throw ApiError.notFound('Category not found');
    if (existing._count.productFamilies > 0) {
      throw ApiError.badRequest('Cannot delete category with products');
    }
    if (existing._count.children > 0) {
      throw ApiError.badRequest('Cannot delete category with subcategories');
    }

    await prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { id, deleted: true };
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
