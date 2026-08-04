import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';

/**
 * Catalog freshness signal.
 *
 * The problem this solves: a vendor's browser holds the catalog in IndexedDB and only re-synced
 * when the page was hard-reloaded. An admin could change a price and vendors would keep quoting
 * the old one indefinitely — a correctness bug, not a speed one.
 *
 * The counter is a single row bumped atomically by one `UPDATE … SET version = version + 1`.
 * Reading it is one primary-key lookup, which matters because every connected client polls it as
 * a fallback when its socket drops.
 *
 * Deliberately over-inclusive: it is bumped on any write to a catalog-shaping model, including
 * writes that turn out not to change what a vendor sees. An unnecessary revalidation costs one
 * cheap request; a missed one shows a vendor the wrong price. Those are not symmetric.
 */
export class CatalogVersionCounterService {
  private cached: { version: string; readAt: number } | null = null;
  /** Short TTL only — a burst of reads within one tick shares a lookup, staleness stays sub-second. */
  private static readonly CACHE_MS = 1_000;

  async current(): Promise<string> {
    const now = Date.now();
    if (this.cached && now - this.cached.readAt < CatalogVersionCounterService.CACHE_MS) {
      return this.cached.version;
    }
    const row = await prisma.catalogVersion.findUnique({
      where: { id: 1 },
      select: { version: true },
    });
    const version = (row?.version ?? 1n).toString();
    this.cached = { version, readAt: now };
    return version;
  }

  /**
   * Atomically increments and returns the new version. Safe under concurrency: the increment
   * happens inside the database, so two simultaneous admin saves produce two distinct versions
   * rather than racing on a read-modify-write.
   */
  async bump(): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ version: bigint }>>`
      UPDATE catalog_versions SET version = version + 1, updated_at = NOW()
      WHERE id = 1
      RETURNING version
    `;
    const version = (rows[0]?.version ?? 1n).toString();
    this.cached = { version, readAt: Date.now() };
    logger.debug('Catalog version bumped', { version });
    return version;
  }

  /** Test seam — clears the 1s read cache. */
  resetCache(): void {
    this.cached = null;
  }
}

export const catalogVersionCounter = new CatalogVersionCounterService();
