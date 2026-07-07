import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

type ProductLinkRule = {
  templateCode: string;
  match: (ctx: { slug: string; categorySlug: string | null; printProfileKey: string | null }) => boolean;
};

const PRODUCT_WORKFLOW_RULES: ProductLinkRule[] = [
  {
    templateCode: 'WF-FOILING',
    match: ({ slug, categorySlug }) =>
      categorySlug === 'foiling' || slug.includes('foil') || slug.includes('foiling'),
  },
  {
    templateCode: 'WF-UV',
    match: ({ slug, categorySlug, printProfileKey }) =>
      categorySlug === 'acrylic-prints' ||
      slug.includes('acrylic') ||
      slug.includes('spot-uv') ||
      slug.includes('raised-uv') ||
      printProfileKey === 'SPOT_UV' ||
      printProfileKey === 'RAISED_UV',
  },
  {
    templateCode: 'WF-OFFSET',
    match: ({ slug, categorySlug }) =>
      categorySlug === 'catalogues-booklets' ||
      slug.includes('booklet') ||
      slug.includes('catalogue') ||
      slug.includes('annual-report'),
  },
  {
    templateCode: 'WF-LAMINATION',
    match: ({ slug }) => slug.includes('laminated') || slug.includes('lamination'),
  },
  {
    templateCode: 'WF-FLEX',
    match: ({ categorySlug, printProfileKey }) =>
      categorySlug === 'flex-banners' || printProfileKey === 'FLEX',
  },
  {
    templateCode: 'WF-LARGE_FORMAT',
    match: ({ categorySlug, printProfileKey }) =>
      categorySlug === 'vinyl-prints' ||
      categorySlug === 'canvas-prints' ||
      categorySlug === 'acp-boards' ||
      printProfileKey === 'VINYL' ||
      printProfileKey === 'CANVAS' ||
      printProfileKey === 'BOARD',
  },
  {
    templateCode: 'WF-DIE_CUT',
    match: ({ categorySlug, printProfileKey }) =>
      categorySlug === 'folding-cartons' ||
      categorySlug === 'paper-bags' ||
      printProfileKey === 'PACKAGING' ||
      printProfileKey === 'PACKAGING_BOX',
  },
  {
    templateCode: 'WF-DIGITAL',
    match: ({ slug, categorySlug }) =>
      categorySlug === 'visiting-cards' ||
      categorySlug === 'wedding-cards' ||
      categorySlug === 'invitation-cards' ||
      categorySlug === 'flyers' ||
      categorySlug === 'brochures' ||
      categorySlug === 'digital-printing' ||
      slug.startsWith('art-paper-') ||
      slug.includes('gumming'),
  },
];

const DEFAULT_TEMPLATE = 'WF-STANDARD-PRODUCTION';

function resolveTemplateCode(product: {
  slug: string;
  categorySlug: string | null;
  printProfileKey: string | null;
}): string {
  for (const rule of PRODUCT_WORKFLOW_RULES) {
    if (rule.match(product)) return rule.templateCode;
  }
  return DEFAULT_TEMPLATE;
}

export async function seedProductWorkflows(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('product-workflows');
  const { prisma, registry } = ctx;

  const versions = await prisma.productOfferingVersion.findMany({
    where: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
    select: {
      id: true,
      productOffering: {
        select: {
          slug: true,
          series: {
            select: {
              family: { select: { category: { select: { slug: true } } } },
            },
          },
        },
      },
      printProcess: { select: { code: true } },
      productPrintConfig: { select: { printProcess: { select: { code: true } } } },
    },
  });

  const counts = new Map<string, number>();
  let linked = 0;

  for (const version of versions) {
    const slug = version.productOffering.slug;
    const categorySlug = version.productOffering.series.family.category.slug;
    const printProfileKey =
      version.printProcess?.code ?? version.productPrintConfig?.printProcess?.code ?? null;

    const templateCode = resolveTemplateCode({ slug, categorySlug, printProfileKey });
    const templateId = registry.workflowTemplates.get(templateCode);

    if (!templateId) {
      log.warn(`Template ${templateCode} not found for product ${slug}`);
      continue;
    }

    await prisma.productOfferingWorkflow.upsert({
      where: { productOfferingVersionId: version.id },
      update: { workflowTemplateId: templateId, isDefault: true },
      create: {
        productOfferingVersionId: version.id,
        workflowTemplateId: templateId,
        isDefault: true,
      },
    });

    counts.set(templateCode, (counts.get(templateCode) ?? 0) + 1);
    linked += 1;
  }

  log.info(
    `Linked ${linked} product versions to workflows: ${[...counts.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`,
  );
}
