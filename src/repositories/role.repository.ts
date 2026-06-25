import type { RoleName } from '@prisma/client';
import { prisma } from '../config/database.js';
import { CacheKeys, CacheTtl } from '../common/cache/cache-keys.js';
import { redisCache } from '../common/cache/redis-cache.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';

export class RoleRepository {
  async findByName(name: RoleName) {
    return loadOncePerRequest(`role:${name}`, () =>
      redisCache.getOrLoad(CacheKeys.role(name), CacheTtl.ROLE_SEC, () =>
        prisma.role.findUnique({ where: { name } }),
      ),
    );
  }

  invalidate(name: RoleName): void {
    void redisCache.del(CacheKeys.role(name));
  }
}

export const roleRepository = new RoleRepository();
