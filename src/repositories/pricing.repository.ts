import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../common/errors/ApiError.js';
import { TtlCache } from '../common/cache/ttl-cache.js';
import { CacheTtl } from '../common/cache/cache-keys.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';
import { calculatePriceFromBundle } from '../services/pricing-engine/pricing.calculator.js';
import type { PriceCalculationInput, PriceCalculationResult } from '../services/pricing-engine/pricing.types.js';

export const VERSION_PRICING_INCLUDE = {
  quantityPricing: { where: { isActive: true }, orderBy: { quantity: 'asc' } },
  configurationFields: {
    orderBy: { sortOrder: 'asc' },
    include: {
      options: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { pricing: true },
      },
    },
  },
  pricingRules: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ProductOfferingVersionInclude;

const localVersionCaches = new Map<
  string,
  TtlCache<Awaited<ReturnType<typeof fetchVersionBundle>>>
>();

function localCacheFor(versionId: string) {
  let cache = localVersionCaches.get(versionId);
  if (!cache) {
    cache = new TtlCache<Awaited<ReturnType<typeof fetchVersionBundle>>>(
      CacheTtl.PRICING_VERSION_SEC * 1000,
    );
    localVersionCaches.set(versionId, cache);
  }
  return cache;
}

async function fetchVersionBundle(versionId: string) {
  return prisma.productOfferingVersion.findUnique({
    where: { id: versionId, deletedAt: null },
    include: VERSION_PRICING_INCLUDE,
  });
}

export class PricingRepository {
  async loadVersionBundle(versionId: string) {
    return loadOncePerRequest(`pricing:bundle:${versionId}`, () =>
      localCacheFor(versionId).getOrLoad(() => fetchVersionBundle(versionId)),
    );
  }

  async calculate(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    const bundle = await this.loadVersionBundle(input.versionId);
    if (!bundle) {
      throw ApiError.notFound('Product version not found');
    }
    return calculatePriceFromBundle(bundle, input);
  }

  invalidateVersion(versionId: string): void {
    localVersionCaches.get(versionId)?.invalidate();
  }
}

export const pricingRepository = new PricingRepository();
