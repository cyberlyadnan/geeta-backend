import type { Prisma } from '@prisma/client';

/**
 * Builds the OR-clause for a product name search.
 *
 * Two things this deliberately gets right, because the previous version got both wrong and the
 * admin create-order screen's search looked broken as a result:
 *
 * 1. **It searches `displayName`.** Every list UI renders `displayName ?? name`, so a product
 *    with a display name was shown under a label that could not be searched for. Searching a
 *    different field than you display is a guaranteed "no results" bug the moment anyone sets a
 *    display name.
 * 2. **It matches each word independently.** A single `contains` on the whole string means
 *    "brown gumming" finds nothing if the product is named "Gumming - Brown", because the words
 *    are in the other order. Staff type words they remember, not exact substrings, so every word
 *    must match somewhere for the row to count.
 *
 * `sku` is included as an exact-ish path for staff working from a printed sheet.
 */
export function buildProductSearchFilter(search: string): Prisma.ProductOfferingWhereInput[] {
  const words = tokenizeSearch(search);
  if (words.length === 0) return [];

  // Every word must match one of the fields — AND across words, OR across fields. Returned as a
  // single-element OR so callers can keep spreading it into `where.OR`.
  return [
    {
      AND: words.map((word) => ({
        OR: [
          { name: { contains: word, mode: 'insensitive' as const } },
          { displayName: { contains: word, mode: 'insensitive' as const } },
          { shortDescription: { contains: word, mode: 'insensitive' as const } },
          { sku: { contains: word, mode: 'insensitive' as const } },
        ],
      })),
    },
  ];
}

/** Splits on whitespace and drops empties, so "  brown   gum " → ["brown", "gum"]. */
export function tokenizeSearch(search: string): string[] {
  return search
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}
