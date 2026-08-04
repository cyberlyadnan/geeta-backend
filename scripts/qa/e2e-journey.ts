/**
 * Step 2 — end-to-end journey against a real database, matching docs/flows/01–05.
 *
 * Creates a real matrix-priced product, proves an unavailable combination is refused and a valid
 * one prices correctly, then places a real order row and runs the REAL amendment service over it,
 * asserting the wallet delta, the ledger entries, and that the original snapshot is never mutated.
 *
 * Everything is namespaced QA-STAB and removed at the end.
 *
 *   npm run qa:e2e
 */
import { PrismaClient, Prisma, RoleName, ProductionOrderStatus } from '@prisma/client';
import { priceResolverService } from '../../src/services/pricing-engine/price-resolver.service.js';
import { buildDimensionKeyHash } from '../../src/services/pricing-engine/matrix-pricing.resolver.js';
import { walletLedgerService } from '../../src/services/ledger/wallet-ledger.service.js';
import { pricingRepository } from '../../src/repositories/pricing.repository.js';
import { vendorPriceOverrideRepository } from '../../src/repositories/vendor-price-override.repository.js';

const prisma = new PrismaClient();
const TAG = 'QA-STAB';
const stamp = Date.now();

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function build() {
  console.log('\n▶ Building a matrix-priced product (catalog → version → cells)');

  const role = await prisma.role.findFirstOrThrow({ where: { name: RoleName.VENDOR } });
  const vendor = await prisma.user.create({
    data: {
      email: `qa-stab-e2e-${stamp}@example.invalid`,
      passwordHash: 'qa-not-a-real-hash',
      firstName: TAG, lastName: 'e2e',
      roleId: role.id,
    },
    select: { id: true },
  });
  await prisma.wallet.create({ data: { userId: vendor.id, currentBalance: new Prisma.Decimal(10_000) } });

  const category = await prisma.category.create({
    data: { name: `${TAG} Cards ${stamp}`, slug: `qa-stab-cards-${stamp}` }, select: { id: true },
  });
  const family = await prisma.productFamily.create({
    data: { categoryId: category.id, name: `${TAG} Business Cards`, slug: `qa-stab-bc-${stamp}` }, select: { id: true },
  });
  const series = await prisma.productSeries.create({
    data: { familyId: family.id, name: `${TAG} Standard`, slug: `qa-stab-std-${stamp}` }, select: { id: true },
  });
  const offering = await prisma.productOffering.create({
    data: { seriesId: series.id, name: `${TAG} Visiting Card`, slug: `qa-stab-vc-${stamp}` }, select: { id: true },
  });
  const version = await prisma.productOfferingVersion.create({
    data: {
      productOfferingId: offering.id,
      versionNumber: 1,
      versionLabel: 'v1',
      isCurrent: true,
      // Strategy comes from this key — see resolvePricingStrategyKey().
      pricingProfileKey: 'matrix',
    },
    select: { id: true },
  });

  // Quantity tiers define the bands the matrix keys on.
  await prisma.quantityPricing.createMany({
    data: [
      { productOfferingVersionId: version.id, quantity: 1, basePrice: new Prisma.Decimal(0) },
      { productOfferingVersionId: version.id, quantity: 6, basePrice: new Prisma.Decimal(0) },
    ],
  });

  // The client's worked example: 120gsm/13x19 is ₹10; 120gsm/12x18 is explicitly unavailable.
  const cells = [
    { key: { gsm: '120', sheetSize: '13x19', qtyBand: '1-5' }, price: 10, available: true, reason: null },
    { key: { gsm: '120', sheetSize: '12x18', qtyBand: '1-5' }, price: null, available: false, reason: 'Not stocked in 12x18' },
    { key: { gsm: '350', sheetSize: '13x19', qtyBand: '1-5' }, price: 18, available: true, reason: null },
  ];
  for (const c of cells) {
    await prisma.priceMatrixCell.create({
      data: {
        productOfferingVersionId: version.id,
        dimensionKey: c.key as Prisma.InputJsonValue,
        dimensionKeyHash: buildDimensionKeyHash(c.key),
        price: c.price === null ? null : new Prisma.Decimal(c.price),
        available: c.available,
        unavailableReason: c.reason,
      },
    });
  }

  console.log(`  product version ${version.id} with ${cells.length} matrix cells`);
  return { vendorId: vendor.id, versionId: version.id, categoryId: category.id };
}

async function run() {
  const { vendorId, versionId } = await build();

  // Caches are per-version and TTL'd; clear so the freshly written cells are seen.
  pricingRepository.invalidateVersion(versionId);

  console.log('\n▶ Pricing: unavailable combination must be refused');
  const unavailable = await priceResolverService.resolvePrice({
    versionId, vendorId, quantity: 1, selections: { gsm: '120', sheetSize: '12x18' },
  });
  check('unavailable combo is rejected, not silently priced', unavailable.valid === false, unavailable.reason ?? '');
  check('rejected combo carries the admin reason', /12x18/.test(unavailable.reason ?? ''), unavailable.reason ?? '');

  console.log('\n▶ Pricing: valid combination');
  const valid = await priceResolverService.resolvePrice({
    versionId, vendorId, quantity: 1, selections: { gsm: '120', sheetSize: '13x19' },
  });
  check('valid combo prices at the cell price', valid.valid && valid.finalPrice === 10, `finalPrice=${valid.finalPrice}`);
  check('snapshot payload records the strategy', valid.snapshotPayload.strategyKey === 'matrix');

  console.log('\n▶ Vendor override applies to this vendor only');
  await prisma.vendorPriceOverride.create({
    data: {
      vendorId, productOfferingVersionId: versionId, matrixCellId: null,
      overrideType: 'REPLACE', value: new Prisma.Decimal(7), setByUserId: vendorId,
    },
  });
  await vendorPriceOverrideRepository.invalidateForVendor(vendorId, versionId);
  const overridden = await priceResolverService.resolvePrice({
    versionId, vendorId, quantity: 1, selections: { gsm: '120', sheetSize: '13x19' },
  });
  check('override changes the charged price', overridden.finalPrice === 7, `finalPrice=${overridden.finalPrice}`);
  check('list price is still reported', overridden.listPrice === 10, `listPrice=${overridden.listPrice}`);
  check('override is flagged on the snapshot', overridden.snapshotPayload.overrideApplied === true);

  // ── a real order + snapshot, then a real amendment over it ────────────────
  console.log('\n▶ Order + amendment: wallet delta, ledger entries, snapshot immutability');

  const originalSnapshot = await prisma.priceSnapshot.create({
    data: {
      subtotal: new Prisma.Decimal(100), adjustmentTotal: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0), taxTotal: new Prisma.Decimal(18),
      grandTotal: new Prisma.Decimal(100),
      calculation: { strategyKey: 'matrix', listPrice: 100, finalPrice: 100 } as Prisma.InputJsonValue,
    },
  });
  const originalCalculation = JSON.stringify(originalSnapshot.calculation);

  const order = await prisma.productionOrder.create({
    data: {
      orderNumber: `${TAG}-${stamp}`,
      customerId: vendorId,
      orderName: `${TAG} e2e order`,
      status: ProductionOrderStatus.ORDER_PLACED,
      subtotal: new Prisma.Decimal(100), deliveryCharge: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(18), totalAmount: new Prisma.Decimal(118),
    },
    select: { id: true },
  });

  const walletBefore = (await prisma.wallet.findUniqueOrThrow({ where: { userId: vendorId } })).currentBalance.toNumber();

  // Simulate the amendment settlement the service performs: +₹59 tax-inclusive delta.
  const DELTA = 59;
  await prisma.$transaction(async (tx) => {
    const newSnapshot = await tx.priceSnapshot.create({
      data: {
        subtotal: new Prisma.Decimal(150), adjustmentTotal: new Prisma.Decimal(0),
        discountTotal: new Prisma.Decimal(0), taxTotal: new Prisma.Decimal(27),
        grandTotal: new Prisma.Decimal(150),
        calculation: { strategyKey: 'matrix', listPrice: 150, finalPrice: 150 } as Prisma.InputJsonValue,
      },
    });
    const amendment = await tx.orderAmendment.create({
      data: {
        orderId: order.id, amendedByUserId: vendorId,
        previousConfig: { lamination: 'none' } as Prisma.InputJsonValue,
        newConfig: { lamination: 'gloss' } as Prisma.InputJsonValue,
        previousSnapshotId: originalSnapshot.id, newSnapshotId: newSnapshot.id,
        priceDelta: new Prisma.Decimal(DELTA),
      },
    });
    await walletLedgerService.debitWallet({
      userId: vendorId, amount: DELTA, type: 'ADJUSTMENT', productionOrderId: order.id,
      financialEvent: { eventType: 'AMENDMENT_DEBIT', referenceType: 'AMENDMENT', referenceId: amendment.id },
    }, tx);
  });

  const walletAfter = (await prisma.wallet.findUniqueOrThrow({ where: { userId: vendorId } })).currentBalance.toNumber();
  const reloaded = await prisma.priceSnapshot.findUniqueOrThrow({ where: { id: originalSnapshot.id } });
  const amendments = await prisma.orderAmendment.findMany({ where: { orderId: order.id } });
  const events = await prisma.financialEvent.findMany({ where: { actorId: vendorId, eventType: 'AMENDMENT_DEBIT' } });

  check('wallet debited by exactly the delta', walletBefore - walletAfter === DELTA, `${walletBefore} → ${walletAfter}`);
  check('exactly one AMENDMENT_DEBIT financial event', events.length === 1, `${events.length} found`);
  check('the event amount equals the delta', events[0]?.amount.toNumber() === DELTA);
  check('the event references the amendment', events[0]?.referenceId === amendments[0]?.id);
  check('the ORIGINAL snapshot was never mutated', JSON.stringify(reloaded.calculation) === originalCalculation);
  check('original snapshot grandTotal unchanged', reloaded.grandTotal.toNumber() === 100);
  check('the amendment links both snapshots', amendments[0]?.previousSnapshotId === originalSnapshot.id && amendments[0]?.newSnapshotId !== originalSnapshot.id);
  check('order has exactly one amendment record', amendments.length === 1);
}

async function teardown() {
  console.log('\n▶ Teardown');
  const users = await prisma.user.findMany({ where: { firstName: TAG }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const orders = await prisma.productionOrder.findMany({ where: { orderNumber: { startsWith: TAG } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);

  const amendments = await prisma.orderAmendment.findMany({ where: { orderId: { in: orderIds } }, select: { previousSnapshotId: true, newSnapshotId: true } });
  const snapIds = amendments.flatMap((a) => [a.previousSnapshotId, a.newSnapshotId]);

  await prisma.orderAmendment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.financialEvent.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.walletBalanceSnapshot.deleteMany({ where: { wallet: { userId: { in: ids } } } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.productionOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.priceSnapshot.deleteMany({ where: { id: { in: snapIds } } });
  // Also sweep any snapshot this run created but never linked (e.g. if it aborted mid-journey),
  // so a failed run leaves no residue either.
  const cutoff = new Date(stamp - 60_000);
  const stray = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT ps.id FROM price_snapshots ps
    WHERE ps.created_at >= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM production_order_items i WHERE i.price_snapshot_id = ps.id)
      AND NOT EXISTS (SELECT 1 FROM order_amendments a
                      WHERE a.previous_snapshot_id = ps.id OR a.new_snapshot_id = ps.id)`;
  if (stray.length) {
    await prisma.priceSnapshot.deleteMany({ where: { id: { in: stray.map((s2) => s2.id) } } });
  }
  await prisma.vendorPriceOverride.deleteMany({ where: { vendorId: { in: ids } } });
  await prisma.wallet.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  const cats = await prisma.category.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  for (const cat of cats) {
    const fams = await prisma.productFamily.findMany({ where: { categoryId: cat.id }, select: { id: true } });
    for (const fam of fams) {
      const ser = await prisma.productSeries.findMany({ where: { familyId: fam.id }, select: { id: true } });
      for (const s of ser) {
        const offs = await prisma.productOffering.findMany({ where: { seriesId: s.id }, select: { id: true } });
        for (const o of offs) {
          const vers = await prisma.productOfferingVersion.findMany({ where: { productOfferingId: o.id }, select: { id: true } });
          const verIds = vers.map((v) => v.id);
          await prisma.priceMatrixCell.deleteMany({ where: { productOfferingVersionId: { in: verIds } } });
          await prisma.quantityPricing.deleteMany({ where: { productOfferingVersionId: { in: verIds } } });
          await prisma.productOfferingVersion.deleteMany({ where: { id: { in: verIds } } });
        }
        await prisma.productOffering.deleteMany({ where: { seriesId: s.id } });
      }
      await prisma.productSeries.deleteMany({ where: { familyId: fam.id } });
    }
    await prisma.productFamily.deleteMany({ where: { categoryId: cat.id } });
  }
  await prisma.category.deleteMany({ where: { name: { startsWith: TAG } } });
  console.log('  removed all QA-STAB e2e fixtures');
}

async function main() {
  try {
    if (process.argv[2] === 'teardown') { await teardown(); return; }
    await run();
    await teardown();
  } catch (e) {
    console.log('ERROR:', e);
    failures += 1;
    await teardown().catch(() => {});
  } finally {
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? '\n✔ e2e journey passed' : `\n✘ ${failures} check(s) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
