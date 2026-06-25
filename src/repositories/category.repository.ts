import { prisma } from '../config/database.js';
import { CacheKeys, CacheTtl } from '../common/cache/cache-keys.js';
import { redisCache } from '../common/cache/redis-cache.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';

interface CategoryNode {
  id: string;
  parentId: string | null;
}

export class CategoryRepository {
  private async loadActiveTree(): Promise<CategoryNode[]> {
    return redisCache.getOrLoad(CacheKeys.categoryTree(), CacheTtl.CATEGORY_TREE_SEC, () =>
      prisma.category.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, parentId: true },
      }),
    );
  }

  async resolveTreeIds(rootId: string): Promise<string[]> {
    return loadOncePerRequest(`categories:tree:${rootId}`, async () => {
      const all = await this.loadActiveTree();
      const ids = new Set<string>([rootId]);
      let added = true;
      while (added) {
        added = false;
        for (const cat of all) {
          if (cat.parentId && ids.has(cat.parentId) && !ids.has(cat.id)) {
            ids.add(cat.id);
            added = true;
          }
        }
      }
      return [...ids];
    });
  }

  invalidateTree(): void {
    void redisCache.del(CacheKeys.categoryTree());
  }
}

export const categoryRepository = new CategoryRepository();
