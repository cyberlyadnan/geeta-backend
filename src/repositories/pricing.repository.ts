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
        include: {
          pricing: {
            include: {
              quantityTiers: { where: { isActive: true }, orderBy: { quantity: 'asc' } },
            },
          },
        },
      },
    },
  },
  pricingRules: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
  // Phase 0 pricing spine — same cached bundle, no extra round trips.
  priceMatrixCells: true,
  priceModifierRules: true,
  rollWidthOptions: { where: { isActive: true }, orderBy: { widthFeet: 'asc' } },
  productPrintConfig: { select: { pricingStrategyKey: true } },
  printProcess: { select: { pricingStrategyKey: true } },
  // Phase 4 — the product type profile, when one is tagged, states the strategy directly.
  productTypeProfile: {
    select: { key: true, pricingStrategyKey: true, wizardStepsKey: true, requiresDesignApproval: true },
  },
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

export type VersionPricingBundle = NonNullable<Awaited<ReturnType<typeof fetchVersionBundle>>>;

/**
 * Same fallback chain the rate catalogue has used for display since before this resolver
 * existed — reused here (rather than a new field) so an already-configured product starts
 * pricing through the matrix/flex engines the moment it's tagged, with no data migration.
 */
export function resolvePricingStrategyKey(bundle: VersionPricingBundle): string {
  return (
    // A tagged product type profile states the strategy outright, so it wins. Safe to put first:
    // nothing created before Phase 4 has a profile, so no existing product changes strategy.
    bundle.productTypeProfile?.pricingStrategyKey ??
    bundle.productPrintConfig?.pricingStrategyKey ??
    bundle.printProcess?.pricingStrategyKey ??
    bundle.pricingProfileKey ??
    'quantity_pricing'
  );
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

  /**
   * Drops every cached pricing bundle.
   *
   * Called whenever the catalog version is bumped — i.e. whenever an admin writes anything
   * price-shaping. Without this, a matrix cell edit would keep being served from this TTL cache
   * until it expired, so `resolvePrice()` could return the old price *after* the admin changed
   * it. That is the same stale-price failure the client-side freshness fix addresses, one layer
   * down, and the Phase 0 non-negotiables rule it out.
   *
   * Clearing all versions rather than just the edited one is deliberate: the bump signal is not
   * version-scoped, admin writes are rare, and a cold bundle costs exactly one query to rebuild.
   * Correctness is worth more than those queries.
   */
  invalidateAll(): void {
    for (const cache of localVersionCaches.values()) cache.invalidate();
  }
}

export const pricingRepository = new PricingRepository();
