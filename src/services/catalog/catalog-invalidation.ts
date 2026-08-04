import { catalogVersionCounter } from './catalog-version-counter.service.js';
import { logger } from '../../logs/logger.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';

/**
 * Models whose contents shape what a vendor sees in the catalogue or is quoted as a price.
 *
 * `PriceMatrixCell` and `VendorPriceOverride` are the important additions over the original
 * version-groups design, which derived freshness from nine `max(updatedAt)` aggregates and
 * included neither. An admin could edit a matrix cell and no version changed at all, so vendor
 * clients never revalidated and kept quoting the old price — the exact failure the Phase 0
 * non-negotiables forbid.
 */
const CATALOG_MODELS = new Set([
  'Category',
  'ProductFamily',
  'ProductSeries',
  'ProductOffering',
  'ProductOfferingVersion',
  'ProductImage',
  'ConfigurationGroup',
  'ConfigurationField',
  'ConfigurationFieldOption',
  'ConfigurationRule',
  'QuantityPricing',
  'PricingRule',
  'PriceMatrixCell',
  'PriceModifierRule',
  'RollWidthOption',
  'VendorPriceOverride',
  'ProductTypeProfile',
]);

const WRITE_OPS = new Set([
  'create', 'createMany', 'createManyAndReturn',
  'update', 'updateMany',
  'upsert',
  'delete', 'deleteMany',
]);

export function isCatalogWrite(model: string | undefined, operation: string): boolean {
  return Boolean(model) && CATALOG_MODELS.has(model!) && WRITE_OPS.has(operation);
}

/** Listeners are notified after a bump so transports (Socket.io) can push to clients. */
type VersionListener = (version: string) => void;
const listeners = new Set<VersionListener>();

export function onCatalogVersionChanged(listener: VersionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Bumped after the write resolves, not inside it. If the surrounding transaction later rolls
 * back we will have bumped for a change that did not happen — which costs connected clients one
 * cheap revalidation. The opposite mistake (bumping inside a transaction that commits, but
 * missing it when the extension cannot join that transaction) would leave vendors on stale
 * prices, so the bias is deliberate.
 */
export function scheduleCatalogBump(): void {
  // Drop the server-side pricing bundle cache immediately and synchronously — before the counter
  // write, before any listener. If this waited on the bump, a request arriving in between could
  // still be quoted the pre-edit price from cache. Correctness first, then the freshness signal.
  pricingRepository.invalidateAll();

  void catalogVersionCounter
    .bump()
    .then((version) => {
      for (const listener of listeners) {
        try {
          listener(version);
        } catch (error) {
          logger.debug('Catalog version listener failed', { error });
        }
      }
    })
    .catch((error: unknown) => {
      // Never fail an admin save because the freshness signal could not be written.
      logger.error('Failed to bump catalog version', { error });
    });
}
