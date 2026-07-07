import {
  MasterConfigStatus,
  ProductOfferingVersionStatus,
  ProductStatus,
  ProductVisibility,
  type PrismaClient,
} from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { hydrateRegistryFromDatabase } from '../core/registry-loader.js';
import { upsertProductCatalogEntry } from './product-helpers.js';
import {
  CLIENT_CATEGORY_NAME,
  CLIENT_CATEGORY_SLUG,
  FIRST_CLIENT_CATALOG,
  FIRST_CLIENT_FAMILY_SLUGS,
  FIRST_CLIENT_PRODUCT_SLUGS,
  FIRST_CLIENT_SERIES_SLUGS,
} from './first-client-catalog.data.js';

export type CatalogAuditSnapshot = {
  categories: Array<{ id: string; slug: string; name: string; parentId: string | null; isActive: boolean }>;
  families: Array<{ id: string; slug: string; name: string; categoryId: string; categorySlug: string | null }>;
  series: Array<{ id: string; slug: string; name: string; familyId: string; familySlug: string | null }>;
  products: Array<{
    id: string;
    slug: string;
    name: string;
    sku: string;
    seriesSlug: string | null;
    hasVersion: boolean;
    hasWorkflow: boolean;
    hasPricing: boolean;
    hasPrintConfig: boolean;
  }>;
  duplicates: {
    categorySlugs: string[];
    familySlugs: string[];
    seriesSlugs: string[];
    productSlugs: string[];
  };
};

export type CatalogImportReport = {
  ranAt: string;
  auditBefore: CatalogAuditSnapshot;
  corrections: string[];
  created: {
    category: boolean;
    families: string[];
    series: string[];
    products: string[];
  };
  updated: {
    families: string[];
    series: string[];
    products: string[];
  };
  validation: {
    passed: boolean;
    issues: string[];
    notes: string[];
  };
  hierarchy: string;
};

const CATEGORY_ALIASES = new Set([
  'digital-printing',
  'digital-paper-printing',
  'digital-paper',
  'digital-print',
]);

const FAMILY_ALIASES: Record<string, string> = {
  'art-paper-sheet': 'art-paper',
  'art-paper-sheets': 'art-paper',
  'gumming': 'gumming-sheet',
  'gumming-sheets': 'gumming-sheet',
};

export async function auditClientCatalog(prisma: PrismaClient): Promise<CatalogAuditSnapshot> {
  const [categories, families, series, products] = await Promise.all([
    prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, name: true, parentId: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.productFamily.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, name: true, categoryId: true, category: { select: { slug: true } } },
    }),
    prisma.productSeries.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, name: true, familyId: true, family: { select: { slug: true } } },
    }),
    prisma.productOffering.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        sku: true,
        series: { select: { slug: true } },
        versions: {
          where: { isCurrent: true, deletedAt: null },
          take: 1,
          select: {
            id: true,
            workflow: { select: { id: true } },
            quantityPricing: { where: { isActive: true }, take: 1, select: { id: true } },
            productPrintConfig: { select: { id: true } },
          },
        },
      },
    }),
  ]);

  const dup = (slugs: string[]) => slugs.filter((s, i) => slugs.indexOf(s) !== i);

  return {
    categories,
    families: families.map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      categoryId: f.categoryId,
      categorySlug: f.category.slug,
    })),
    series: series.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      familyId: s.familyId,
      familySlug: s.family.slug,
    })),
    products: products.map((p) => {
      const v = p.versions[0];
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        sku: p.sku,
        seriesSlug: p.series.slug,
        hasVersion: Boolean(v),
        hasWorkflow: Boolean(v?.workflow),
        hasPricing: Boolean(v?.quantityPricing.length),
        hasPrintConfig: Boolean(v?.productPrintConfig),
      };
    }),
    duplicates: {
      categorySlugs: dup(categories.map((c) => c.slug)),
      familySlugs: dup(families.map((f) => f.slug)),
      seriesSlugs: dup(series.map((s) => s.slug)),
      productSlugs: dup(products.map((p) => p.slug)),
    },
  };
}

async function ensureClientMasters(ctx: SeedContext): Promise<void> {
  const { prisma, registry } = ctx;
  const mmUnitId = registry.units.get('MM');
  if (!mmUnitId) throw new Error('MM unit missing — run master seed first');

  for (const code of ['12X18', '13X19'] as const) {
    if (registry.sheetSizes.has(code)) continue;
    const dims = code === '12X18' ? { w: 305, h: 457, name: '12 × 18 inch' } : { w: 330, h: 483, name: '13 × 19 inch' };
    const row = await prisma.sheetSize.upsert({
      where: { code },
      update: { status: MasterConfigStatus.ACTIVE, deletedAt: null },
      create: {
        code,
        name: dims.name,
        width: dims.w,
        height: dims.h,
        measurementUnitId: mmUnitId,
        aspectRatio: dims.w / dims.h,
        sheetType: 'PAPER',
        sortOrder: code === '12X18' ? 9 : 10,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    registry.sheetSizes.set(code, row.id);
  }

  const templateDefs = [
    {
      code: 'CLIENT_SHEET_13X19',
      name: 'Client Catalog — 13×19 Sheet',
      items: [{ code: '13X19', label: '13×19 inch', sheetCode: '13X19' }],
    },
    {
      code: 'CLIENT_SHEET_12X18_13X19',
      name: 'Client Catalog — 12×18 & 13×19 Sheets',
      items: [
        { code: '12X18', label: '12×18 inch', sheetCode: '12X18' },
        { code: '13X19', label: '13×19 inch', sheetCode: '13X19' },
      ],
    },
  ] as const;

  for (const def of templateDefs) {
    const row = await prisma.sizeTemplate.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        strategyType: 'SHEET_BASED',
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: def.code,
        name: def.name,
        strategyType: 'SHEET_BASED',
        config: {},
        description: def.name,
        sortOrder: def.code === 'CLIENT_SHEET_13X19' ? 20 : 21,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    await prisma.sizeTemplateItem.deleteMany({ where: { sizeTemplateId: row.id } });
    for (const [idx, item] of def.items.entries()) {
      await prisma.sizeTemplateItem.create({
        data: {
          sizeTemplateId: row.id,
          sheetSizeId: registry.sheetSizes.get(item.sheetCode),
          code: item.code,
          label: item.label,
          sortOrder: idx,
          isActive: true,
        },
      });
    }
    registry.sizeTemplates.set(def.code, row.id);
  }

  const spec = await prisma.printSpecificationTemplate.upsert({
    where: { code: 'CLIENT_DIGITAL_SHEET' },
    update: {
      bleedMm: 3,
      safeAreaMm: 3,
      minDpi: 300,
      maxFileSizeMb: 100,
      colorMode: 'CMYK',
      validationEnabled: true,
      previewEnabled: true,
      status: MasterConfigStatus.ACTIVE,
      deletedAt: null,
    },
    create: {
      code: 'CLIENT_DIGITAL_SHEET',
      name: 'Client Digital Sheet — 300 DPI CMYK',
      finishedWidthMm: 330,
      finishedHeightMm: 483,
      artworkWidthMm: 336,
      artworkHeightMm: 489,
      bleedMm: 3,
      safeAreaMm: 3,
      minDpi: 300,
      maxFileSizeMb: 100,
      colorMode: 'CMYK',
      validationEnabled: true,
      previewEnabled: true,
      coverageAnalysisEnabled: false,
      allowedFormats: ['PDF', 'AI', 'CDR', 'PSD', 'JPEG', 'PNG', 'JPG'],
      sortOrder: 12,
      status: MasterConfigStatus.ACTIVE,
      createdById: ctx.actorId,
    },
  });
  registry.printSpecifications.set('CLIENT_DIGITAL_SHEET', spec.id);
}

async function resolveDigitalPrintingCategory(
  ctx: SeedContext,
  corrections: string[],
): Promise<string> {
  const { prisma, registry } = ctx;

  const existing = await prisma.category.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { slug: CLIENT_CATEGORY_SLUG },
        { slug: { in: [...CATEGORY_ALIASES] } },
        { name: { equals: CLIENT_CATEGORY_NAME, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    if (existing.slug !== CLIENT_CATEGORY_SLUG) {
      corrections.push(`Renamed category slug "${existing.slug}" → "${CLIENT_CATEGORY_SLUG}"`);
    }
    const row = await prisma.category.update({
      where: { id: existing.id },
      data: {
        name: CLIENT_CATEGORY_NAME,
        slug: CLIENT_CATEGORY_SLUG,
        parentId: null,
        isActive: true,
        deletedAt: null,
        description: 'Digital sheet printing — art paper, gumming, and commercial digital jobs.',
        sortOrder: 1,
      },
    });
    registry.categories.set(CLIENT_CATEGORY_SLUG, row.id);
    return row.id;
  }

  const created = await prisma.category.create({
    data: {
      name: CLIENT_CATEGORY_NAME,
      slug: CLIENT_CATEGORY_SLUG,
      description: 'Digital sheet printing — art paper, gumming, and commercial digital jobs.',
      sortOrder: 1,
      isActive: true,
    },
  });
  registry.categories.set(CLIENT_CATEGORY_SLUG, created.id);
  corrections.push(`Created category "${CLIENT_CATEGORY_NAME}" (${CLIENT_CATEGORY_SLUG})`);
  return created.id;
}

async function reconcileFamilyAliases(ctx: SeedContext, categoryId: string, corrections: string[]): Promise<void> {
  const { prisma } = ctx;

  for (const [alias, canonical] of Object.entries(FAMILY_ALIASES)) {
    const aliasRow = await prisma.productFamily.findFirst({ where: { slug: alias, deletedAt: null } });
    const canonicalRow = await prisma.productFamily.findFirst({ where: { slug: canonical, deletedAt: null } });
    if (!aliasRow) continue;

    if (canonicalRow && canonicalRow.id !== aliasRow.id) {
      await prisma.productSeries.updateMany({
        where: { familyId: aliasRow.id },
        data: { familyId: canonicalRow.id },
      });
      await prisma.productFamily.update({
        where: { id: aliasRow.id },
        data: { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED },
      });
      corrections.push(`Merged duplicate family "${alias}" into "${canonical}"`);
    } else if (!canonicalRow) {
      await prisma.productFamily.update({
        where: { id: aliasRow.id },
        data: { slug: canonical, categoryId, isActive: true, status: ProductStatus.ACTIVE, deletedAt: null },
      });
      corrections.push(`Renamed family "${alias}" → "${canonical}"`);
    }
  }
}

async function hydrateWorkflowRegistry(ctx: SeedContext): Promise<void> {
  const templates = await ctx.prisma.workflowTemplate.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, code: true },
  });
  for (const tpl of templates) ctx.registry.workflowTemplates.set(tpl.code, tpl.id);
}

function buildHierarchyMarkdown(): string {
  const lines = [`${CLIENT_CATEGORY_NAME}`, '├── Art Paper'];
  const art = FIRST_CLIENT_CATALOG.filter((e) => e.familySlug === 'art-paper');
  for (const [i, e] of art.entries()) {
    const branch = i === art.length - 1 ? '│   └──' : '│   ├──';
    lines.push(`${branch} ${e.seriesName} → ${e.name}`);
  }
  lines.push('└── Gumming Sheet');
  const gum = FIRST_CLIENT_CATALOG.filter((e) => e.familySlug === 'gumming-sheet');
  for (const [i, e] of gum.entries()) {
    const branch = i === gum.length - 1 ? '    └──' : '    ├──';
    lines.push(`${branch} ${e.seriesName} → ${e.name}`);
  }
  return lines.join('\n');
}

async function validateClientCatalog(prisma: PrismaClient): Promise<{ passed: boolean; issues: string[]; notes: string[] }> {
  const issues: string[] = [];
  const notes: string[] = [];

  const category = await prisma.category.findFirst({ where: { slug: CLIENT_CATEGORY_SLUG, deletedAt: null } });
  if (!category) issues.push('Missing category: digital-printing');

  for (const familySlug of FIRST_CLIENT_FAMILY_SLUGS) {
    const family = await prisma.productFamily.findFirst({
      where: { slug: familySlug, deletedAt: null, categoryId: category?.id },
    });
    if (!family) issues.push(`Missing family under Digital Printing: ${familySlug}`);
  }

  for (const entry of FIRST_CLIENT_CATALOG) {
    const product = await prisma.productOffering.findFirst({
      where: { slug: entry.slug, deletedAt: null },
      include: {
        series: { include: { family: { include: { category: true } } } },
        versions: {
          where: { isCurrent: true, deletedAt: null },
          take: 1,
          include: {
            workflow: { include: { workflowTemplate: true } },
            quantityPricing: { where: { isActive: true } },
            productPrintConfig: { include: { sizeTemplate: { include: { items: true } } } },
            sizeTemplate: { include: { items: { include: { sheetSize: true } } } },
          },
        },
      },
    });

    if (!product) {
      issues.push(`Missing product: ${entry.slug}`);
      continue;
    }
    if (product.status !== ProductStatus.ACTIVE) issues.push(`Product not ACTIVE: ${entry.slug}`);
    if (product.visibility !== ProductVisibility.VENDOR_ONLY && product.visibility !== ProductVisibility.PUBLIC) {
      issues.push(`Product not vendor-visible: ${entry.slug}`);
    }
    if (product.series.family.category.slug !== CLIENT_CATEGORY_SLUG) {
      issues.push(`Product ${entry.slug} not under Digital Printing category`);
    }
    if (product.series.slug !== entry.seriesSlug) {
      issues.push(`Product ${entry.slug} series mismatch (expected ${entry.seriesSlug})`);
    }

    const version = product.versions[0];
    if (!version) {
      issues.push(`Product ${entry.slug} has no current version`);
      continue;
    }
    if (version.status !== ProductOfferingVersionStatus.ACTIVE) {
      issues.push(`Version not ACTIVE for ${entry.slug}`);
    }
    if (!version.workflow) issues.push(`No workflow on ${entry.slug}`);
    if (!version.quantityPricing.some((t) => t.quantity === 100)) {
      issues.push(`Missing 100-qty pricing tier on ${entry.slug}`);
    }
    if (!version.productPrintConfig) issues.push(`Missing print config on ${entry.slug}`);

    const sizeTemplate = version.sizeTemplate ?? version.productPrintConfig?.sizeTemplate;
    const itemCodes = sizeTemplate?.items.map((i) => i.code) ?? [];
    const expectedItems =
      entry.sizeTemplateCode === 'CLIENT_SHEET_12X18_13X19' ? ['12X18', '13X19'] : ['13X19'];
    for (const code of expectedItems) {
      if (!itemCodes.includes(code)) {
        issues.push(`Product ${entry.slug} missing sheet size ${code} in size template`);
      }
    }
  }

  const slugSets = [
    { label: 'family', slugs: [...FIRST_CLIENT_FAMILY_SLUGS] },
    { label: 'series', slugs: [...FIRST_CLIENT_SERIES_SLUGS] },
    { label: 'product', slugs: [...FIRST_CLIENT_PRODUCT_SLUGS] },
  ];
  for (const { label, slugs } of slugSets) {
  const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dup.length) issues.push(`Duplicate ${label} slugs in catalog definition: ${dup.join(', ')}`);
  }

  const vendorCount = await prisma.productOffering.count({
    where: {
      slug: { in: [...FIRST_CLIENT_PRODUCT_SLUGS] },
      deletedAt: null,
      isActive: true,
      status: ProductStatus.ACTIVE,
      visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY] },
    },
  });
  notes.push(`Vendor-visible client products: ${vendorCount}/${FIRST_CLIENT_CATALOG.length}`);

  return { passed: issues.length === 0, issues, notes };
}

export async function importFirstClientCatalog(ctx: SeedContext): Promise<CatalogImportReport> {
  const log = createSeedLogger('first-client-catalog');
  const corrections: string[] = [];
  const created = { category: false, families: [] as string[], series: [] as string[], products: [] as string[] };
  const updated = { families: [] as string[], series: [] as string[], products: [] as string[] };

  const auditBefore = await auditClientCatalog(ctx.prisma);

  await hydrateRegistryFromDatabase(ctx);
  await hydrateWorkflowRegistry(ctx);
  await ensureClientMasters(ctx);

  const categoryIdBefore = ctx.registry.categories.get(CLIENT_CATEGORY_SLUG);
  const categoryId = await resolveDigitalPrintingCategory(ctx, corrections);
  if (!categoryIdBefore) created.category = true;

  await reconcileFamilyAliases(ctx, categoryId, corrections);

  const canonicalSeriesSlugs = new Set([...FIRST_CLIENT_SERIES_SLUGS]);
  const clientFamilies = await ctx.prisma.productFamily.findMany({
    where: { slug: { in: [...FIRST_CLIENT_FAMILY_SLUGS] }, deletedAt: null },
    select: { id: true, slug: true, series: { where: { deletedAt: null }, select: { id: true, slug: true, offerings: { where: { deletedAt: null }, select: { id: true } } } } },
  });
  for (const family of clientFamilies) {
    for (const series of family.series) {
      if (canonicalSeriesSlugs.has(series.slug)) continue;
      if (series.offerings.length > 0) {
        corrections.push(`Left legacy series "${series.slug}" under ${family.slug} (has products)`);
        continue;
      }
      await ctx.prisma.productSeries.update({
        where: { id: series.id },
        data: { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED },
      });
      corrections.push(`Archived orphan series "${series.slug}" under ${family.slug}`);
    }
  }

  const existingFamilies = new Set(auditBefore.families.map((f) => f.slug));
  const existingSeries = new Set(auditBefore.series.map((s) => s.slug));
  const existingProducts = new Set(auditBefore.products.map((p) => p.slug));

  for (const [idx, entry] of FIRST_CLIENT_CATALOG.entries()) {
    try {
      await ctx.prisma.$transaction(
        async (tx) => {
          const txCtx: SeedContext = { ...ctx, prisma: tx as SeedContext['prisma'] };
          await upsertProductCatalogEntry(txCtx, entry, idx + 1);
        },
        { timeout: 60_000, maxWait: 30_000 },
      );

      if (!existingFamilies.has(entry.familySlug) && !created.families.includes(entry.familySlug)) {
        created.families.push(entry.familySlug);
      } else if (existingFamilies.has(entry.familySlug) && !updated.families.includes(entry.familySlug)) {
        updated.families.push(entry.familySlug);
      }

      if (!existingSeries.has(entry.seriesSlug)) created.series.push(entry.seriesSlug);
      else updated.series.push(entry.seriesSlug);

      if (!existingProducts.has(entry.slug)) created.products.push(entry.slug);
      else updated.products.push(entry.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Failed ${entry.slug}: ${message}`);
      throw err;
    }
  }

  log.info(`Imported ${FIRST_CLIENT_CATALOG.length} client catalog products`);

  const validation = await validateClientCatalog(ctx.prisma);

  return {
    ranAt: new Date().toISOString(),
    auditBefore,
    corrections,
    created: {
      category: created.category,
      families: [...new Set(created.families)],
      series: [...new Set(created.series)],
      products: [...new Set(created.products)],
    },
    updated: {
      families: [...new Set(updated.families)],
      series: [...new Set(updated.series)],
      products: [...new Set(updated.products)],
    },
    validation,
    hierarchy: buildHierarchyMarkdown(),
  };
}

export function formatImportReportMarkdown(report: CatalogImportReport): string {
  const lines: string[] = [
    '# First Client Catalog Import',
    '',
    `**Run at:** ${report.ranAt}`,
    '',
    '## Existing Data Found (Before Import)',
    '',
    `- Categories: ${report.auditBefore.categories.length}`,
    `- Families: ${report.auditBefore.families.length}`,
    `- Series: ${report.auditBefore.series.length}`,
    `- Products: ${report.auditBefore.products.length}`,
    '',
  ];

  if (report.auditBefore.families.length) {
    lines.push('### Families');
    for (const f of report.auditBefore.families) {
      lines.push(`- \`${f.slug}\` — ${f.name} (category: ${f.categorySlug ?? '?'})`);
    }
    lines.push('');
  }

  if (report.auditBefore.products.length) {
    lines.push('### Products');
    for (const p of report.auditBefore.products) {
      lines.push(
        `- \`${p.slug}\` — ${p.name} | version: ${p.hasVersion ? 'yes' : 'no'} | workflow: ${p.hasWorkflow ? 'yes' : 'no'} | pricing: ${p.hasPricing ? 'yes' : 'no'}`,
      );
    }
    lines.push('');
  }

  lines.push('## Data Corrected', '');
  if (report.corrections.length === 0) lines.push('_No corrections required._');
  else report.corrections.forEach((c) => lines.push(`- ${c}`));
  lines.push('');

  lines.push('## New Records Created', '');
  lines.push(`- Category: ${report.created.category ? 'Digital Printing' : 'reused existing'}`);
  lines.push(`- Families: ${report.created.families.join(', ') || 'none'}`);
  lines.push(`- Series: ${report.created.series.length} series`);
  lines.push(`- Products: ${report.created.products.length} products`);
  lines.push('');

  lines.push('## Catalog Hierarchy', '', '```', report.hierarchy, '```', '');

  lines.push('## Products Imported', '');
  for (const entry of FIRST_CLIENT_CATALOG) {
    const price = entry.tiers[0];
    lines.push(
      `- **${entry.name}** (\`${entry.slug}\`) — SKU \`${entry.sku}\` — ${entry.sizeTemplateCode} — ₹${price?.basePrice} / ${price?.quantity} pcs`,
    );
  }
  lines.push('');

  lines.push('## Versions & Configuration', '');
  lines.push('- Print process: `DIGITAL`');
  lines.push('- Print spec: `CLIENT_DIGITAL_SHEET` (3 mm bleed, 3 mm safe, 300 DPI, CMYK)');
  lines.push('- Size templates: `CLIENT_SHEET_13X19` or `CLIENT_SHEET_12X18_13X19` (sheet master refs `12X18` / `13X19`)');
  lines.push('- Artwork rules: master digital sheet profile');
  lines.push('- File requirements: `ARTWORK_MAIN` (PDF, AI, CDR, PSD, JPEG, PNG)');
  lines.push('- Attributes: `MINIMAL` (colour option)');
  lines.push('');

  lines.push('## Pricing', '');
  lines.push('| Product line | Qty | Price (INR) |');
  lines.push('|--------------|-----|-------------|');
  lines.push('| Art Paper (all GSM) | 100 | ₹1,000 |');
  lines.push('| Gumming Sheet (all series) | 100 | ₹1,500 |');
  lines.push('');
  lines.push('Pricing stored in `quantity_pricing` tiers — ready for future quantity slabs.');
  lines.push('');

  lines.push('## Workflow Mapping', '');
  lines.push('- Template: `WF-DIGITAL`');
  lines.push('- Steps: Artwork Verification → Digital Printing → Cutting & Trimming → Quality Check → Packing → Dispatch');
  lines.push('');

  lines.push('## Validation Results', '');
  lines.push(report.validation.passed ? '**PASSED** — all checks OK.' : '**FAILED** — see issues below.');
  lines.push('');
  if (report.validation.issues.length) {
    lines.push('### Issues');
    report.validation.issues.forEach((i) => lines.push(`- ${i}`));
    lines.push('');
  }
  if (report.validation.notes.length) {
    lines.push('### Notes');
    report.validation.notes.forEach((n) => lines.push(`- ${n}`));
  }

  return lines.join('\n');
}
