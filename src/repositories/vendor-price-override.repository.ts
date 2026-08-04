import { prisma } from '../config/database.js';
import { redisCache } from '../common/cache/redis-cache.js';
import { CacheTtl } from '../common/cache/cache-keys.js';
import { loadOncePerRequest } from '../common/cache/request-cache-accessor.js';
import { decimalToNumber } from '../utils/money.js';
import type { VendorPriceOverrideRecord } from '../services/pricing-engine/vendor-price-override.resolver.js';

const PREFIX = 'vendor-price-override:';

export const VendorPriceOverrideCacheKeys = {
  /** versionId first so a single admin edit can invalidate every vendor's cache with one scan. */
  forVendorAndVersion: (versionId: string, vendorId: string) => `${PREFIX}${versionId}:${vendorId}`,
  versionPrefix: (versionId: string) => `${PREFIX}${versionId}:`,
} as const;

export class VendorPriceOverrideRepository {
  /**
   * All override rows a vendor has for a product version — usually zero or one. Wrapped in
   * loadOncePerRequest so a rate-catalogue matrix build (one resolvePrice() call per cell, same
   * vendor+version for every cell) costs one Redis round trip per request, not one per cell.
   */
  async loadForVendorAndVersion(
    vendorId: string,
    versionId: string,
  ): Promise<VendorPriceOverrideRecord[]> {
    const key = VendorPriceOverrideCacheKeys.forVendorAndVersion(versionId, vendorId);
    return loadOncePerRequest(`vendor-override:${key}`, () =>
      redisCache.getOrLoad(key, CacheTtl.VENDOR_PRICE_OVERRIDE_SEC, async () => {
        const rows = await prisma.vendorPriceOverride.findMany({
          where: { vendorId, productOfferingVersionId: versionId },
          select: { id: true, matrixCellId: true, overrideType: true, value: true },
        });
        return rows.map((row) => ({
          id: row.id,
          matrixCellId: row.matrixCellId,
          overrideType: row.overrideType,
          value: decimalToNumber(row.value),
        }));
      }),
    );
  }

  /** Picks the override that applies to a specific resolved base: cell-specific first, then whole-product. */
  pickApplicable(
    overrides: VendorPriceOverrideRecord[],
    matrixCellId: string | null,
  ): VendorPriceOverrideRecord | null {
    if (matrixCellId) {
      const cellMatch = overrides.find((o) => o.matrixCellId === matrixCellId);
      if (cellMatch) return cellMatch;
    }
    return overrides.find((o) => o.matrixCellId === null) ?? null;
  }

  async invalidateForVendor(vendorId: string, versionId: string): Promise<void> {
    await redisCache.del(VendorPriceOverrideCacheKeys.forVendorAndVersion(versionId, vendorId));
  }

  async invalidateForVersion(versionId: string): Promise<void> {
    await redisCache.delByPrefix(VendorPriceOverrideCacheKeys.versionPrefix(versionId));
  }
}

export const vendorPriceOverrideRepository = new VendorPriceOverrideRepository();
