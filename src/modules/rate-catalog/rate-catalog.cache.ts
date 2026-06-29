import { CacheTtl } from '../../common/cache/cache-keys.js';
import { redisCache } from '../../common/cache/redis-cache.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';

const PREFIX = 'rate-catalog:';

export const RateCatalogCacheKeys = {
  productRates: (productId: string, versionId: string, cacheKey: string) =>
    `${PREFIX}product:${productId}:v:${versionId}:${cacheKey}`,
  productList: (hash: string) => `${PREFIX}products:${hash}`,
  filters: () => `${PREFIX}filters:v1`,
} as const;

export class RateCatalogCacheService {
  buildRatesCacheKey(query: Record<string, unknown>): string {
    const sorted = Object.keys(query)
      .sort()
      .map((k) => `${k}=${String(query[k] ?? '')}`)
      .join('&');
    return Buffer.from(sorted).toString('base64url').slice(0, 48);
  }

  async getProductRates<T>(key: string, loader: () => Promise<T>): Promise<T> {
    return redisCache.getOrLoad(key, CacheTtl.PRICING_VERSION_SEC, loader);
  }

  async invalidateProduct(productId: string): Promise<void> {
    await redisCache.delByPrefix(`${PREFIX}product:${productId}:`);
  }

  async invalidateVersion(versionId: string): Promise<void> {
    pricingRepository.invalidateVersion(versionId);
    await redisCache.delByPrefix(`${PREFIX}product:`);
  }

  async invalidateAll(): Promise<void> {
    await redisCache.delByPrefix(PREFIX);
  }

  async invalidateFilters(): Promise<void> {
    await redisCache.del(RateCatalogCacheKeys.filters());
  }
}

export const rateCatalogCacheService = new RateCatalogCacheService();
