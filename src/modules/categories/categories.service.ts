import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';

interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  children: CategoryNode[];
}

function mapCategoryNode(
  cat: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    parentId: string | null;
  },
  all: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    sortOrder: number;
    parentId: string | null;
  }>,
): CategoryNode {
  const children = all
    .filter((c) => c.parentId === cat.id)
    .map((child) => mapCategoryNode(child, all));

  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    imageUrl: cat.imageUrl,
    sortOrder: cat.sortOrder,
    children,
  };
}

export class CategoriesService {
  async findAll() {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        sortOrder: true,
        parentId: true,
      },
    });

    const roots = categories.filter((c) => !c.parentId);
    return roots.map((c) => mapCategoryNode(c, categories));
  }

  async findById(id: string) {
    const category = await prisma.category.findFirst({
      where: { id, deletedAt: null, isActive: true },
      include: {
        children: {
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        parent: true,
      },
    });
    if (!category) throw ApiError.notFound('Category not found');

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      parent: category.parent
        ? { id: category.parent.id, name: category.parent.name, slug: category.parent.slug }
        : null,
      children: category.children.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        imageUrl: c.imageUrl,
      })),
    };
  }
}

export const categoriesService = new CategoriesService();
