import { Prisma } from '@prisma/client';
import { isCatalogWrite, scheduleCatalogBump } from './catalog-invalidation.js';

/**
 * Bumps the catalog version whenever anything catalog-shaping is written.
 *
 * Implemented as a Prisma extension rather than explicit calls in each admin service on purpose:
 * there are a dozen-plus write paths (products, versions, configuration, matrix cells, modifier
 * rules, roll widths, vendor overrides) and any one of them forgotten reintroduces the stale-price
 * bug silently. A single interception point cannot be forgotten by the next person adding an
 * admin endpoint.
 */
export function catalogVersionExtension() {
  return Prisma.defineExtension({
    name: 'geeta-catalog-version',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (isCatalogWrite(model, operation)) {
            scheduleCatalogBump();
          }
          return result;
        },
      },
    },
  });
}
