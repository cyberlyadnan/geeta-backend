/**
 * UAT walkthrough verification — the parts of docs/audits/phase0-4-uat-script.md not already
 * covered by `npm run qa:e2e` (Parts 1, 2, 4, 5) or `npm run qa:stab` (Part 7).
 *
 * Covers UAT Part 3 (roll rounding / rejection) against a REAL flex product, and UAT Part 6
 * (walk-in customer deduplication by phone) against the REAL retail-customer service.
 *
 *   npm run qa:uat
 */
import { PrismaClient, Prisma, RoleName } from '@prisma/client';
import { priceResolverService } from '../../src/services/pricing-engine/price-resolver.service.js';
import { retailCustomerService } from '../../src/modules/admin-retail-customers/retail-customer.service.js';
import { pricingRepository } from '../../src/repositories/pricing.repository.js';

const prisma = new PrismaClient();
const TAG = 'QA-STAB';
const stamp = Date.now();
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function buildFlexProduct() {
  const category = await prisma.category.create({
    data: { name: `${TAG} Banners ${stamp}`, slug: `qa-stab-ban-${stamp}` }, select: { id: true } });
  const family = await prisma.productFamily.create({
    data: { categoryId: category.id, name: `${TAG} Flex`, slug: `qa-stab-flex-${stamp}` }, select: { id: true } });
  const series = await prisma.productSeries.create({
    data: { familyId: family.id, name: `${TAG} Vinyl`, slug: `qa-stab-vinyl-${stamp}` }, select: { id: true } });
  const offering = await prisma.productOffering.create({
    data: { seriesId: series.id, name: `${TAG} Banner`, slug: `qa-stab-banner-${stamp}` }, select: { id: true } });
  const version = await prisma.productOfferingVersion.create({
    data: {
      productOfferingId: offering.id, versionNumber: 1, versionLabel: 'v1', isCurrent: true,
      pricingProfileKey: 'flex_area', ratePerSqFt: new Prisma.Decimal(10),
    },
    select: { id: true },
  });
  // Stocked roll widths from the UAT script's worked example.
  for (const w of [3, 4, 6, 8, 10]) {
    await prisma.rollWidthOption.create({
      data: { productOfferingVersionId: version.id, widthFeet: new Prisma.Decimal(w) } });
  }
  return version.id;
}

async function uatPart3() {
  console.log('\n▶ UAT Part 3 — roll rounding and rejection (real flex product, widths 3/4/6/8/10)');
  const versionId = await buildFlexProduct();
  pricingRepository.invalidateVersion(versionId);

  // 3.2 — 7x12 must round UP to 8x12, never down to 6x12.
  const rounded = await priceResolverService.resolvePrice({
    versionId, quantity: 1, selections: {}, uploadedDimensions: { widthFt: 7, heightFt: 12 },
  });
  check('3.2 — 7×12 is accepted', rounded.valid === true, rounded.reason ?? '');
  check('3.2 — charged width rounds UP to 8, not down to 6', rounded.chargedWidthFt === 8, `charged=${rounded.chargedWidthFt}`);
  check('3.2 — charged length stays 12', rounded.chargedLengthFt === 12, `charged=${rounded.chargedLengthFt}`);
  check('3.2 — the vendor is told it was rounded', rounded.wasRounded === true);
  check('3.2 — price is charged on the rounded area (8×12×₹10)', rounded.finalPrice === 960, `₹${rounded.finalPrice}`);

  // 3.3 — wider than the widest roll must be refused.
  const tooWide = await priceResolverService.resolvePrice({
    versionId, quantity: 1, selections: {}, uploadedDimensions: { widthFt: 12, heightFt: 12 },
  });
  check('3.3 — a size wider than every roll is refused', tooWide.valid === false, tooWide.reason ?? '');
  check('3.3 — the refusal names the maximum width', /maximum available width/i.test(tooWide.reason ?? ''), tooWide.reason ?? '');

  // 3.4 — an exact fit prices with no rounding notice.
  const exact = await priceResolverService.resolvePrice({
    versionId, quantity: 1, selections: {}, uploadedDimensions: { widthFt: 3, heightFt: 2 },
  });
  check('3.4 — an exact fit is accepted with no rounding', exact.valid === true && exact.wasRounded === false);
  check('3.4 — priced on the true area (3×2×₹10)', exact.finalPrice === 60, `₹${exact.finalPrice}`);
}

async function uatPart6() {
  console.log('\n▶ UAT Part 6 — walk-in customer is recognised by phone, not duplicated');
  const role = await prisma.role.findFirstOrThrow({ where: { name: RoleName.ADMIN } });
  const staff = await prisma.user.create({
    data: {
      email: `qa-stab-staff-${stamp}@example.invalid`, passwordHash: 'qa-not-real',
      firstName: TAG, lastName: 'staff', roleId: role.id,
    },
    select: { id: true },
  });

  const phone = `98${String(stamp).slice(-8)}`;

  // 6.2 — first walk-in order creates the customer.
  const first = await retailCustomerService.findOrCreate(
    { name: 'Asha Kumari', phone, hasGst: false }, staff.id);
  check('6.2 — a new phone number creates the walk-in customer', Boolean(first.id));

  // 6.3 — same phone, different spelling of the name, must reuse.
  const second = await retailCustomerService.findOrCreate(
    { name: 'Asha K', phone, hasGst: false }, staff.id);
  check('6.3 — the same phone returns the SAME customer', second.id === first.id, `${first.id} vs ${second.id}`);

  const rows = await prisma.retailCustomer.count({ where: { phone } });
  check('6.3 — exactly one customer row exists for that phone', rows === 1, `${rows} rows`);

  // A different phone must be a different person.
  const other = await retailCustomerService.findOrCreate(
    { name: 'Someone Else', phone: `${phone}9`, hasGst: false }, staff.id);
  check('6.3 — a different phone creates a different customer', other.id !== first.id);

  check('6.4 — the customer records which staff member created them',
    (await prisma.retailCustomer.findUniqueOrThrow({ where: { id: first.id } })).createdById === staff.id);
}

async function teardown() {
  console.log('\n▶ Teardown');
  const staff = await prisma.user.findMany({ where: { firstName: TAG }, select: { id: true } });
  const staffIds = staff.map((s) => s.id);
  await prisma.retailCustomer.deleteMany({ where: { createdById: { in: staffIds } } });
  await prisma.user.deleteMany({ where: { id: { in: staffIds } } });

  const cats = await prisma.category.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  for (const cat of cats) {
    const fams = await prisma.productFamily.findMany({ where: { categoryId: cat.id }, select: { id: true } });
    for (const fam of fams) {
      const sers = await prisma.productSeries.findMany({ where: { familyId: fam.id }, select: { id: true } });
      for (const s of sers) {
        const offs = await prisma.productOffering.findMany({ where: { seriesId: s.id }, select: { id: true } });
        for (const o of offs) {
          const vers = await prisma.productOfferingVersion.findMany({ where: { productOfferingId: o.id }, select: { id: true } });
          const ids = vers.map((v) => v.id);
          await prisma.rollWidthOption.deleteMany({ where: { productOfferingVersionId: { in: ids } } });
          await prisma.priceMatrixCell.deleteMany({ where: { productOfferingVersionId: { in: ids } } });
          await prisma.quantityPricing.deleteMany({ where: { productOfferingVersionId: { in: ids } } });
          await prisma.productOfferingVersion.deleteMany({ where: { id: { in: ids } } });
        }
        await prisma.productOffering.deleteMany({ where: { seriesId: s.id } });
      }
      await prisma.productSeries.deleteMany({ where: { familyId: fam.id } });
    }
    await prisma.productFamily.deleteMany({ where: { categoryId: cat.id } });
  }
  await prisma.category.deleteMany({ where: { name: { startsWith: TAG } } });
  console.log('  removed all QA-STAB UAT fixtures');
}

async function main() {
  try {
    await uatPart3();
    await uatPart6();
  } catch (e) {
    console.log('ERROR:', e);
    failures += 1;
  } finally {
    await teardown().catch((e) => console.log('teardown error', e));
    await prisma.$disconnect();
  }
  console.log(failures === 0 ? '\n✔ UAT walkthrough verified' : `\n✘ ${failures} step(s) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
