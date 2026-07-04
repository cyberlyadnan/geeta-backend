/**
 * Catalog & vendor-visibility integrity audit.
 * Run: npx dotenv -e .env -e .env.local -- tsx scripts/audit-catalog-flow.ts
 */
import { PrismaClient, ProductStatus, ProductVisibility } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const issues: string[] = [];
  const notes: string[] = [];

  const [
    categories,
    families,
    series,
    products,
    versions,
    workflows,
    defaultWorkflow,
    activeVendorProducts,
  ] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null } }),
    prisma.productFamily.findMany({ where: { deletedAt: null } }),
    prisma.productSeries.findMany({ where: { deletedAt: null } }),
    prisma.productOffering.findMany({
      where: { deletedAt: null },
      include: {
        series: { include: { family: true } },
        versions: {
          where: { isCurrent: true },
          take: 1,
          include: { workflow: true },
        },
      },
    }),
    prisma.productOfferingVersion.count({ where: { deletedAt: null } }),
    prisma.productOfferingWorkflow.count(),
    prisma.workflowTemplate.findFirst({
      where: { isDefault: true, status: 'ACTIVE' },
      include: { _count: { select: { steps: true } } },
    }),
    prisma.productOffering.count({
      where: {
        deletedAt: null,
        isActive: true,
        status: ProductStatus.ACTIVE,
        visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY] },
        versions: { some: { isCurrent: true, deletedAt: null } },
        series: { deletedAt: null, isActive: true, family: { deletedAt: null, isActive: true } },
      },
    }),
  ]);

  const activeCategories = categories.filter((c) => c.isActive && !c.parentId);
  const familyCategoryIds = new Set(families.map((f) => f.categoryId));

  for (const f of families) {
    if (!categories.some((c) => c.id === f.categoryId)) {
      issues.push(`Family ${f.id} (${f.name}) references missing category ${f.categoryId}`);
    }
  }

  for (const s of series) {
    if (!families.some((f) => f.id === s.familyId)) {
      issues.push(`Series ${s.id} (${s.name}) references missing family ${s.familyId}`);
    }
  }

  for (const p of products) {
    if (!p.series || p.series.deletedAt) {
      issues.push(`Product ${p.id} (${p.name}) has missing/deleted series`);
    }
    if (p.series?.family?.deletedAt) {
      issues.push(`Product ${p.id} (${p.name}) family is soft-deleted`);
    }
    if (p.versions.length === 0) {
      issues.push(`Product ${p.id} (${p.name}) has no current version`);
    }
    if (
      p.status === ProductStatus.ACTIVE &&
      p.versions[0] &&
      p.versions[0].status !== 'ACTIVE'
    ) {
      notes.push(
        `Product ${p.name} is ACTIVE but current version is ${p.versions[0].status} (vendor may still see it after visibility fix)`,
      );
    }
    if (p.status === ProductStatus.ACTIVE && !p.versions[0]?.workflow) {
      notes.push(
        `Product ${p.name} has no ProductOfferingWorkflow — orders use default workflow template if configured`,
      );
    }
  }

  const categoriesWithoutFamilies = activeCategories.filter((c) => !familyCategoryIds.has(c.id));

  console.log('═══════════════════════════════════════════════════');
  console.log('  Catalog Flow Audit');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Categories (active roots): ${activeCategories.length} / ${categories.length} total`);
  console.log(`Families: ${families.length}`);
  console.log(`Series: ${series.length}`);
  console.log(`Products: ${products.length}`);
  console.log(`Versions (non-deleted): ${versions}`);
  console.log(`Product↔Workflow links: ${workflows}`);
  console.log(`Vendor-visible products: ${activeVendorProducts}`);
  console.log(
    `Default workflow: ${
      defaultWorkflow
        ? `${defaultWorkflow.code} (${defaultWorkflow._count.steps} steps)`
        : 'MISSING — order placement will fail without per-product workflow'
    }`,
  );
  console.log(`Active root categories without families: ${categoriesWithoutFamilies.length}`);
  for (const c of categoriesWithoutFamilies) {
    notes.push(`Category "${c.name}" has no families (vendor sees category, empty family list)`);
  }

  if (issues.length === 0) {
    console.log('\n✔ No broken FK / orphan product links found');
  } else {
    console.log(`\n✖ ${issues.length} integrity issue(s):`);
    for (const i of issues) console.log(`  - ${i}`);
  }

  if (notes.length > 0) {
    console.log(`\nNotes (${notes.length}):`);
    for (const n of notes.slice(0, 30)) console.log(`  • ${n}`);
    if (notes.length > 30) console.log(`  … and ${notes.length - 30} more`);
  }

  console.log('\nVendor visibility rules (products):');
  console.log('  deletedAt = null');
  console.log('  isActive = true');
  console.log('  status = ACTIVE');
  console.log('  visibility IN (PUBLIC, VENDOR_ONLY)');
  console.log('  has current version (any status)');
  console.log('  series.isActive = true, family not deleted');
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
