import type { ProductCatalogEntry } from './product-helpers.js';

export const CLIENT_CATEGORY_SLUG = 'digital-printing';
export const CLIENT_CATEGORY_NAME = 'Digital Printing';
export const CLIENT_WORKFLOW_CODE = 'WF-DIGITAL';

const SIZE_13X19 = 'CLIENT_SHEET_13X19';
const SIZE_12X18_13X19 = 'CLIENT_SHEET_12X18_13X19';

const ART_PAPER_PRICE = 1000;
const GUMMING_PRICE = 1500;

const VERSION_METADATA = {
  productionDays: 2,
  deliveryDays: 3,
  artwork: {
    bleedMm: 3,
    safeAreaMm: 3,
    recommendedDpi: 300,
    minDpi: 300,
    colorMode: 'CMYK',
    preferredFormat: 'PDF/X',
    acceptedFormats: ['PDF', 'AI', 'CDR', 'PSD', 'JPEG', 'PNG'],
    maxFileSizeMb: 100,
  },
} as const;

type ArtPaperGsm = 100 | 130 | 170 | 250 | 300 | 350 | 400;

function artPaperEntry(gsm: ArtPaperGsm, sortOrder: number): ProductCatalogEntry {
  const dualSheet = gsm === 250 || gsm === 300 || gsm === 350;
  const slug = `art-paper-${gsm}-gsm`;
  return {
    name: `Art Paper ${gsm} GSM`,
    slug,
    categorySlug: CLIENT_CATEGORY_SLUG,
    familyName: 'Art Paper',
    familySlug: 'art-paper',
    familyDescription: 'Premium art paper for high-quality digital sheet printing.',
    familySortOrder: 1,
    seriesName: `${gsm} GSM`,
    seriesSlug: slug,
    seriesDescription: `${gsm} GSM art paper — digital sheet print.`,
    seriesSortOrder: sortOrder,
    seriesProductCode: `DP-ART-${gsm}`,
    shortDescription: `Digital print on ${gsm} GSM art paper. Professional CMYK output with bleed and safe-area guides.`,
    description: [
      `Art Paper ${gsm} GSM is a premium coated sheet stock for vivid digital printing.`,
      'Upload print-ready artwork with 3 mm bleed and 3 mm safe margin.',
      'Recommended resolution: 300 DPI. Color mode: CMYK.',
      'Accepted formats: PDF, AI, CDR, PSD, JPEG, PNG.',
    ].join(' '),
    sku: `GP-ARTPAPER${gsm}`,
    printProfileKey: 'CLIENT_DIGITAL_SHEET',
    attributeProfileKey: 'MINIMAL',
    sizeTemplateCode: dualSheet ? SIZE_12X18_13X19 : SIZE_13X19,
    specCode: 'CLIENT_DIGITAL_SHEET',
    workflowTemplateCode: CLIENT_WORKFLOW_CODE,
    productionDays: 2,
    versionMetadata: VERSION_METADATA,
    tiers: [{ quantity: 100, basePrice: ART_PAPER_PRICE }],
    isFeatured: gsm === 250,
  };
}

type GummingSeries = {
  name: string;
  slug: string;
  productCode: string;
  sortOrder: number;
  dualSheet?: boolean;
};

const GUMMING_SERIES: GummingSeries[] = [
  { name: 'Croma Gumming', slug: 'croma-gumming', productCode: 'DP-GUM-CROMA', sortOrder: 1, dualSheet: true },
  { name: 'Mirror Coat Gumming', slug: 'mirror-coat-gumming', productCode: 'DP-GUM-MIRROR', sortOrder: 2 },
  { name: 'Silver Coat Gumming', slug: 'silver-coat-gumming', productCode: 'DP-GUM-SILVER', sortOrder: 3 },
  { name: 'Golden Coat Gumming', slug: 'golden-coat-gumming', productCode: 'DP-GUM-GOLDEN', sortOrder: 4 },
  { name: 'Synthetic Normal Gumming', slug: 'synthetic-normal-gumming', productCode: 'DP-GUM-SYN-N', sortOrder: 5 },
  { name: 'Synthetic AD Gumming', slug: 'synthetic-ad-gumming', productCode: 'DP-GUM-SYN-AD', sortOrder: 6 },
  { name: 'Transparent AD Gumming', slug: 'transparent-ad-gumming', productCode: 'DP-GUM-TRANS', sortOrder: 7 },
  { name: 'Brown Gumming', slug: 'brown-gumming', productCode: 'DP-GUM-BROWN', sortOrder: 8 },
];

function gummingEntry(series: GummingSeries): ProductCatalogEntry {
  return {
    name: series.name,
    slug: series.slug,
    categorySlug: CLIENT_CATEGORY_SLUG,
    familyName: 'Gumming Sheet',
    familySlug: 'gumming-sheet',
    familyDescription: 'Self-adhesive gumming sheets for labels, stickers, and mounting applications.',
    familySortOrder: 2,
    seriesName: series.name,
    seriesSlug: series.slug,
    seriesDescription: `${series.name} — digital sheet print on gumming stock.`,
    seriesSortOrder: series.sortOrder,
    seriesProductCode: series.productCode,
    shortDescription: `Digital print on ${series.name}. CMYK with professional bleed and trim guides.`,
    description: [
      `${series.name} is a gumming (self-adhesive) sheet for digital production.`,
      'Supply artwork at 300 DPI, CMYK, with 3 mm bleed and safe margin.',
      'Accepted formats: PDF, AI, CDR, PSD, JPEG, PNG.',
    ].join(' '),
    sku: `GP-${series.productCode.replace(/-/g, '')}`,
    printProfileKey: 'CLIENT_DIGITAL_SHEET',
    attributeProfileKey: 'MINIMAL',
    sizeTemplateCode: series.dualSheet ? SIZE_12X18_13X19 : SIZE_13X19,
    specCode: 'CLIENT_DIGITAL_SHEET',
    workflowTemplateCode: CLIENT_WORKFLOW_CODE,
    productionDays: 2,
    versionMetadata: VERSION_METADATA,
    tiers: [{ quantity: 100, basePrice: GUMMING_PRICE }],
  };
}

/** First production client catalog — Digital Printing / Art Paper / Gumming Sheet */
export const FIRST_CLIENT_CATALOG: ProductCatalogEntry[] = [
  artPaperEntry(100, 1),
  artPaperEntry(130, 2),
  artPaperEntry(170, 3),
  artPaperEntry(250, 4),
  artPaperEntry(300, 5),
  artPaperEntry(350, 6),
  artPaperEntry(400, 7),
  ...GUMMING_SERIES.map(gummingEntry),
];

/** Slugs that belong to this client catalog (for dedupe / validation) */
export const FIRST_CLIENT_PRODUCT_SLUGS = new Set(FIRST_CLIENT_CATALOG.map((e) => e.slug));
export const FIRST_CLIENT_FAMILY_SLUGS = new Set(FIRST_CLIENT_CATALOG.map((e) => e.familySlug));
export const FIRST_CLIENT_SERIES_SLUGS = new Set(FIRST_CLIENT_CATALOG.map((e) => e.seriesSlug));
