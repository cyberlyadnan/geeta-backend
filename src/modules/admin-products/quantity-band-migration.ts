import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  buildDimensionKeyHash,
  buildQuantityBands,
} from '../../services/pricing-engine/matrix-pricing.resolver.js';

type Tx = Prisma.TransactionClient | PrismaClient;

interface TierRow {
  id: string;
  quantity: number;
  isActive: boolean;
}

export interface BandMigrationResult {
  /** oldLabel -> newLabel actually applied. */
  renamed: Record<string, string>;
  /** Band labels that no longer exist because their tier was removed. */
  removed: string[];
  /** Band labels with no cells yet, because a new tier created them. */
  added: string[];
  cellsRemapped: number;
  cellsDeleted: number;
}

/**
 * Band labels are derived from the tier list ("1-5", "6-10", "11+"), so they are not stable
 * identifiers — editing, adding, or removing any tier can relabel its own band *and* its
 * neighbour's upper bound. Matrix cells store the label, so without this mapping every tier change
 * silently orphans the prices saved against the old label. Keying off the tier id (which survives
 * an edit) is what lets us tell "this band was renamed" apart from "this band is gone".
 */
function bandLabelsByTierId(tiers: TierRow[]): Map<string, string> {
  const active = tiers.filter((t) => t.isActive).sort((a, b) => a.quantity - b.quantity);
  const bands = buildQuantityBands(active);
  const labels = new Map<string, string>();
  active.forEach((tier, index) => {
    const label = bands[index]?.label;
    if (label) labels.set(tier.id, label);
  });
  return labels;
}

export async function readBandLabels(tx: Tx, versionId: string): Promise<Map<string, string>> {
  const tiers = await tx.quantityPricing.findMany({
    where: { productOfferingVersionId: versionId },
    select: { id: true, quantity: true, isActive: true },
  });
  return bandLabelsByTierId(tiers);
}

/**
 * Refuses a tier change that would strand vendor-negotiated prices. Matrix cells cascade-delete
 * their VendorPriceOverride rows, so dropping a band's cells silently would throw away prices an
 * admin agreed with a vendor — better to stop and let them decide.
 */
async function assertNoVendorOverrides(tx: Tx, cellIds: string[], labels: string[]): Promise<void> {
  if (cellIds.length === 0) return;
  const override = await tx.vendorPriceOverride.findFirst({
    where: { matrixCellId: { in: cellIds } },
    select: { vendor: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!override) return;
  const { firstName, lastName, email } = override.vendor;
  const who = `${firstName} ${lastName}`.trim() || email;
  throw ApiError.badRequest(
    `This change removes the ${labels.join(', ')} price band, which still has a negotiated price for ${who}. ` +
      `Remove that vendor's price override for this product first.`,
  );
}

/**
 * Moves existing matrix cells onto the band labels produced by the new tier list.
 *
 * Renames are applied in two passes because (version, dimensionKeyHash) is unique: swapping labels
 * between bands would collide midway through a single pass, so every affected row is first parked
 * on a temporary hash. Cell ids are preserved throughout — recreating them would cascade-delete the
 * vendor price overrides that point at them.
 */
export async function migrateMatrixBands(
  tx: Tx,
  versionId: string,
  before: Map<string, string>,
  after: Map<string, string>,
): Promise<BandMigrationResult> {
  const renames = new Map<string, string>();
  for (const [tierId, oldLabel] of before) {
    const newLabel = after.get(tierId);
    if (newLabel != null && newLabel !== oldLabel) renames.set(oldLabel, newLabel);
  }

  const removed = [...before].filter(([tierId]) => !after.has(tierId)).map(([, label]) => label);
  const beforeLabels = new Set(before.values());
  const added = [...after.values()].filter((label) => !beforeLabels.has(label) && !renames.has(label));

  const result: BandMigrationResult = {
    renamed: Object.fromEntries(renames),
    removed,
    added: added.filter((label) => ![...renames.values()].includes(label)),
    cellsRemapped: 0,
    cellsDeleted: 0,
  };

  if (renames.size === 0 && removed.length === 0) return result;

  const cells = await tx.priceMatrixCell.findMany({
    where: { productOfferingVersionId: versionId },
    select: { id: true, dimensionKey: true },
  });

  const bandOf = (cell: { dimensionKey: Prisma.JsonValue }): string | null => {
    const key = cell.dimensionKey;
    if (typeof key !== 'object' || key === null || Array.isArray(key)) return null;
    const band = (key as Record<string, unknown>)['qtyBand'];
    return typeof band === 'string' ? band : null;
  };

  // --- bands whose tier is gone: the cells are unreachable, so drop them -------------------
  if (removed.length > 0) {
    const doomed = cells.filter((c) => {
      const band = bandOf(c);
      return band != null && removed.includes(band);
    });
    await assertNoVendorOverrides(
      tx,
      doomed.map((c) => c.id),
      removed,
    );
    if (doomed.length > 0) {
      await tx.priceMatrixCell.deleteMany({ where: { id: { in: doomed.map((c) => c.id) } } });
      result.cellsDeleted = doomed.length;
    }
  }

  // --- bands that were relabelled: move the cells across ----------------------------------
  const moving: { id: string; dimensionKey: Record<string, string> }[] = [];
  for (const cell of cells) {
    const band = bandOf(cell);
    const target = band != null ? renames.get(band) : undefined;
    if (target == null) continue;
    moving.push({
      id: cell.id,
      dimensionKey: { ...(cell.dimensionKey as Record<string, string>), qtyBand: target },
    });
  }

  if (moving.length > 0) {
    for (const cell of moving) {
      await tx.priceMatrixCell.update({
        where: { id: cell.id },
        data: { dimensionKeyHash: `migrating:${cell.id}` },
      });
    }
    for (const cell of moving) {
      await tx.priceMatrixCell.update({
        where: { id: cell.id },
        data: {
          dimensionKey: cell.dimensionKey,
          dimensionKeyHash: buildDimensionKeyHash(cell.dimensionKey),
        },
      });
    }
    result.cellsRemapped = moving.length;
  }

  return result;
}
