import { VendorAccountStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import { TtlCache } from '../common/cache/ttl-cache.js';
import { activityLogService } from '../services/activity/index.js';

export interface VendorStatsSummary {
  pending: number;
  verified: number;
  rejected: number;
  suspended: number;
  total: number;
}

const statsCache = new TtlCache<VendorStatsSummary>(
  Number(process.env['VENDOR_STATS_CACHE_TTL_MS'] ?? 15_000),
);

const feedCaches = new Map<
  number,
  TtlCache<Awaited<ReturnType<typeof activityLogService.listRecentVendorActivity>>>
>();

function feedCacheFor(limit: number) {
  let cache = feedCaches.get(limit);
  if (!cache) {
    cache = new TtlCache(Number(process.env['ACTIVITY_FEED_CACHE_TTL_MS'] ?? 10_000));
    feedCaches.set(limit, cache);
  }
  return cache;
}

/** Read model for admin vendor dashboard widgets — single groupBy, TTL cached */
export const vendorSummaryReadModel = {
  async getStats(): Promise<VendorStatsSummary> {
    return statsCache.getOrLoad(async () => {
      const rows = await prisma.vendorProfile.groupBy({
        by: ['accountStatus'],
        _count: { _all: true },
      });

      const byStatus = Object.fromEntries(
        rows.map((r) => [r.accountStatus, r._count._all]),
      ) as Partial<Record<VendorAccountStatus, number>>;

      const pending =
        (byStatus.PENDING ?? 0) +
        (byStatus.UNDER_REVIEW ?? 0) +
        (byStatus.DOCUMENT_REQUIRED ?? 0);
      const verified = byStatus.VERIFIED ?? 0;
      const rejected = byStatus.REJECTED ?? 0;
      const suspended =
        (byStatus.SUSPENDED ?? 0) + (byStatus.BLOCKED ?? 0);

      return {
        pending,
        verified,
        rejected,
        suspended,
        total: rows.reduce((sum, r) => sum + r._count._all, 0),
      };
    });
  },

  async getActivityFeed(limit = 25) {
    return feedCacheFor(limit).getOrLoad(() =>
      activityLogService.listRecentVendorActivity(limit),
    );
  },

  invalidateStats(): void {
    statsCache.invalidate();
  },

  invalidateActivityFeed(): void {
    for (const cache of feedCaches.values()) {
      cache.invalidate();
    }
  },

  invalidateAll(): void {
    statsCache.invalidate();
    for (const cache of feedCaches.values()) {
      cache.invalidate();
    }
  },
};
