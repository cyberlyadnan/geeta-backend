import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { PRODUCT_CATALOG } from './products.catalog.js';
import { upsertProductCatalogEntry } from './product-helpers.js';

export async function seedProducts(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('products');
  let count = 0;
  const failures: Array<{ slug: string; error: string }> = [];

  for (const [idx, entry] of PRODUCT_CATALOG.entries()) {
    try {
      await ctx.prisma.$transaction(
        async (tx) => {
          const txCtx: SeedContext = { ...ctx, prisma: tx as SeedContext['prisma'] };
          await upsertProductCatalogEntry(txCtx, entry, idx + 1);
        },
        { timeout: 60_000, maxWait: 30_000 },
      );
      count++;
      if (count % 25 === 0) log.step(`${count}/${PRODUCT_CATALOG.length} products...`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ slug: entry.slug, error: message });
      log.warn(`Failed: ${entry.slug} — ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Product seed completed with ${failures.length} failure(s). First: ${failures[0]!.slug}`);
  }

  log.info(`Upserted ${count} production catalog products with full print + attribute configuration`);
}
