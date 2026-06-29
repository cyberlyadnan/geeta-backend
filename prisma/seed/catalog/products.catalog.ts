import type { ProductCatalogEntry } from './product-helpers.js';
import { makeSku, slugify } from './product-helpers.js';

const CARD_TIERS = [
  { quantity: 500, basePrice: 1200 },
  { quantity: 1000, basePrice: 2000 },
  { quantity: 2000, basePrice: 3500 },
  { quantity: 5000, basePrice: 7500 },
];

const SHEET_TIERS = [
  { quantity: 50, basePrice: 800 },
  { quantity: 100, basePrice: 1400 },
  { quantity: 250, basePrice: 3000 },
  { quantity: 500, basePrice: 5200 },
];

const FLEX_TIERS = [{ quantity: 1, basePrice: 1200 }];

function cardProduct(
  name: string,
  categorySlug: string,
  family: string,
  series: string,
  profile: ProductCatalogEntry['printProfileKey'] = 'VISITING_CARD',
  attr: ProductCatalogEntry['attributeProfileKey'] = 'VISITING_CARD',
  featured = false,
): ProductCatalogEntry {
  const slug = slugify(name);
  return {
    name,
    slug,
    categorySlug,
    familyName: family,
    familySlug: slugify(`${categorySlug}-${family}`),
    seriesName: series,
    seriesSlug: slugify(`${categorySlug}-${series}`),
    shortDescription: `Min Qty: ${CARD_TIERS[0]!.quantity}`,
    description: `${name} — production master SKU with full print configuration`,
    sku: makeSku(slug),
    printProfileKey: profile,
    attributeProfileKey: attr,
    tiers: CARD_TIERS,
    isFeatured: featured,
  };
}

function sheetProduct(
  name: string,
  categorySlug: string,
  family: string,
  series: string,
  profile: ProductCatalogEntry['printProfileKey'] = 'DIGITAL_SHEET',
): ProductCatalogEntry {
  const slug = slugify(name);
  return {
    name,
    slug,
    categorySlug,
    familyName: family,
    familySlug: slugify(`${categorySlug}-${family}`),
    seriesName: series,
    seriesSlug: slugify(`${categorySlug}-${series}`),
    shortDescription: `Min Qty: ${SHEET_TIERS[0]!.quantity}`,
    sku: makeSku(slug),
    printProfileKey: profile,
    attributeProfileKey: 'DIGITAL_SHEET',
    tiers: SHEET_TIERS,
  };
}

function flexProduct(name: string, categorySlug: string, family: string): ProductCatalogEntry {
  const slug = slugify(name);
  return {
    name,
    slug,
    categorySlug,
    familyName: family,
    familySlug: slugify(`${categorySlug}-${family}`),
    seriesName: name,
    seriesSlug: slugify(`${categorySlug}-${name}`),
    shortDescription: 'Min Qty: 1 sq ft pricing',
    sku: makeSku(slug),
    printProfileKey: 'FLEX',
    attributeProfileKey: 'FLEX_BANNER',
    tiers: FLEX_TIERS,
  };
}

/** 100+ production master products */
export function buildProductCatalog(): ProductCatalogEntry[] {
  const products: ProductCatalogEntry[] = [];

  // ── Visiting Cards (18) ──
  const cardFinishes = ['Matt', 'Gloss', 'Velvet', 'Texture', 'Premium Matt', 'Premium Gloss'];
  const cardGsms = ['300 GSM', '350 GSM', '400 GSM', '500 GSM', '800 GSM'];
  for (const gsm of cardGsms) {
    for (const finish of cardFinishes.slice(0, gsm === '800 GSM' ? 4 : 3)) {
      products.push(
        cardProduct(
          `${gsm} Visiting Card — ${finish}`,
          'visiting-cards',
          gsm,
          finish,
          'VISITING_CARD',
          'VISITING_CARD',
          gsm === '500 GSM' && finish === 'Gloss',
        ),
      );
    }
  }
  products.push(cardProduct('Premium PVC Visiting Card', 'visiting-cards', 'PVC Cards', 'PVC Standard', 'VISITING_CARD'));
  products.push(cardProduct('Metal Visiting Card', 'visiting-cards', 'Metal Cards', 'Metal Elite', 'VISITING_CARD'));

  // ── Specialty cards (8) ──
  products.push(cardProduct('Spot UV Visiting Card', 'spot-uv-cards', 'Spot UV', 'Standard', 'SPOT_UV', 'UV_FINISH', true));
  products.push(cardProduct('Raised UV Visiting Card', 'raised-uv', 'Raised UV', 'Standard', 'RAISED_UV', 'UV_FINISH'));
  products.push(cardProduct('Gold Foil Visiting Card', 'foiling', 'Foiling', 'Gold', 'FOILING', 'VISITING_CARD'));
  products.push(cardProduct('Silver Foil Visiting Card', 'foiling', 'Foiling', 'Silver', 'FOILING', 'VISITING_CARD'));
  products.push(cardProduct('Embossed Visiting Card', 'embossing', 'Embossing', 'Blind Emboss', 'EMBOSS', 'VISITING_CARD'));
  products.push(cardProduct('Debossed Visiting Card', 'embossing', 'Embossing', 'Deboss', 'EMBOSS', 'VISITING_CARD'));
  products.push(cardProduct('Spot UV + Foil Combo Card', 'spot-uv-cards', 'Combo', 'UV Foil', 'SPOT_UV', 'UV_FINISH'));
  products.push(cardProduct('Raised UV Premium Card', 'raised-uv', 'Raised UV', 'Premium', 'RAISED_UV', 'UV_FINISH'));

  // ── Letterheads (6) ──
  ['100 GSM', '120 GSM', '130 GSM'].forEach((gsm) => {
    products.push(sheetProduct(`${gsm} Letterhead`, 'letterheads', gsm, 'Single Side'));
    products.push(sheetProduct(`${gsm} Letterhead — Both Sides`, 'letterheads', gsm, 'Both Sides'));
  });

  // ── Envelopes (4) ──
  ['DL', 'C5', 'C4', '9x12'].forEach((size) => {
    products.push(sheetProduct(`${size} Envelope`, 'envelopes', 'Standard', size));
  });

  // ── Flyers (6) ──
  ['A5 Flyer', 'A4 Flyer', 'A3 Flyer', 'DL Flyer', 'Coupon Flyer', 'Door Hanger Flyer'].forEach((name) => {
    products.push(sheetProduct(name, 'flyers', 'Flyers', name));
  });

  // ── Brochures (6) ──
  ['Bi-Fold Brochure', 'Tri-Fold Brochure', 'Gate Fold Brochure', 'Z-Fold Brochure', 'Corporate Brochure', 'Product Brochure'].forEach(
    (name) => products.push(sheetProduct(name, 'brochures', 'Brochures', name)),
  );

  // ── Catalogues & Booklets (8) ──
  ['8 Page Booklet', '12 Page Booklet', '16 Page Catalogue', '24 Page Catalogue', '32 Page Catalogue', 'Perfect Bind Booklet', 'Wiro Booklet', 'Annual Report'].forEach(
    (name) => {
      const slug = slugify(name);
      products.push({
        name,
        slug,
        categorySlug: 'catalogues',
        familyName: 'Booklets',
        familySlug: 'catalogues-booklets',
        seriesName: name,
        seriesSlug: `catalogues-${slug}`,
        shortDescription: 'Min Qty: 50',
        printProfileKey: 'DIGITAL_SHEET',
        attributeProfileKey: 'BOOKLET',
        tiers: SHEET_TIERS,
      });
    },
  );

  // ── Posters (6) ──
  ['A3 Poster', 'A2 Poster', 'A1 Poster', 'A0 Poster', '18x24 Poster', '24x36 Poster'].forEach((name) => {
    const slug = slugify(name);
    products.push({
      name,
      slug,
      categorySlug: 'posters',
      familyName: 'Posters',
      familySlug: 'posters-standard',
      seriesName: name,
      seriesSlug: `posters-${slug}`,
      shortDescription: 'Min Qty: 10',
      printProfileKey: 'DIGITAL_SHEET',
      attributeProfileKey: 'DIGITAL_SHEET',
      tiers: [
        { quantity: 10, basePrice: 600 },
        { quantity: 50, basePrice: 2200 },
        { quantity: 100, basePrice: 3800 },
      ],
    });
  });

  // ── Flex & Large Format (14) ──
  [
    'Star Flex Banner',
    'Frontlit Flex Banner',
    'Backlit Flex Banner',
    'Glow Sign Board',
    'Vinyl Banner',
    'Vehicle Graphics Vinyl',
    'One Way Vision',
    'Canvas Print',
    'Wall Canvas',
    'ACP Board Print',
    'Sunboard Print',
    'Foam Board Print',
    'Rollup Stand 6×3',
    'Rollup Stand 8×3',
  ].forEach((name) => {
    const isVinyl = /vinyl|vehicle|one way/i.test(name);
    const isCanvas = /canvas/i.test(name);
    const isBoard = /acp|sunboard|foam|glow/i.test(name);
    const profile = isVinyl ? 'VINYL' : isCanvas ? 'CANVAS' : isBoard ? 'BOARD' : 'FLEX';
    const slug = slugify(name);
    products.push({
      name,
      slug,
      categorySlug: isVinyl ? 'vinyl-prints' : isCanvas ? 'canvas-prints' : isBoard ? 'acp-boards' : 'flex-banners',
      familyName: 'Large Format',
      familySlug: `lf-${slugify(name.split(' ')[0]!)}`,
      seriesName: name,
      seriesSlug: `lf-${slug}`,
      shortDescription: 'Min Qty: 1',
      printProfileKey: profile,
      attributeProfileKey: 'FLEX_BANNER',
      tiers: FLEX_TIERS,
    });
  });

  // ── Stickers & Labels (12) ──
  ['Vinyl Sticker', 'Clear Sticker', 'PP Sticker', 'Paper Sticker', 'Die Cut Sticker', 'Kiss Cut Sticker'].forEach((name) => {
    products.push({
      name,
      slug: slugify(name),
      categorySlug: 'stickers',
      familyName: 'Stickers',
      familySlug: 'stickers-vinyl',
      seriesName: name,
      seriesSlug: slugify(`stickers-${name}`),
      shortDescription: 'Min Qty: 100',
      printProfileKey: 'LABEL',
      attributeProfileKey: 'STICKER_LABEL',
      tiers: [
        { quantity: 100, basePrice: 450 },
        { quantity: 500, basePrice: 1800 },
        { quantity: 1000, basePrice: 3200 },
      ],
    });
  });
  ['Product Label', 'Barcode Label', 'Shipping Label', 'Roll Label', 'Sheet Label', 'Custom Shape Label'].forEach((name) => {
    products.push({
      name,
      slug: slugify(name),
      categorySlug: 'labels',
      familyName: 'Labels',
      familySlug: 'labels-roll',
      seriesName: name,
      seriesSlug: slugify(`labels-${name}`),
      shortDescription: 'Min Qty: 100',
      printProfileKey: 'LABEL',
      attributeProfileKey: 'STICKER_LABEL',
      tiers: [
        { quantity: 100, basePrice: 400 },
        { quantity: 500, basePrice: 1600 },
      ],
    });
  });

  // ── Packaging (8) ──
  ['Folding Carton', 'Tuck Box', 'Mailer Box', 'Rigid Box', 'Paper Bag', 'Carry Bag', 'Shopping Bag', 'Product Box'].forEach((name) => {
    products.push({
      name,
      slug: slugify(name),
      categorySlug: name.includes('Bag') ? 'paper-bags' : 'folding-cartons',
      familyName: 'Packaging',
      familySlug: 'packaging-standard',
      seriesName: name,
      seriesSlug: slugify(`pack-${name}`),
      shortDescription: 'Min Qty: 100',
      printProfileKey: 'PACKAGING',
      attributeProfileKey: 'PACKAGING',
      tiers: [
        { quantity: 100, basePrice: 3500 },
        { quantity: 500, basePrice: 14000 },
        { quantity: 1000, basePrice: 25000 },
      ],
    });
  });

  // ── Wedding & Events (8) ──
  ['Wedding Invitation Card', 'Engagement Card', 'Save the Date Card', 'Reception Card', 'Ceremony Card'].forEach((name) => {
    products.push(cardProduct(name, 'wedding-cards', 'Wedding', name, 'VISITING_CARD', 'VISITING_CARD'));
  });
  ['Event Invitation', 'Birthday Invitation'].forEach((name) => {
    products.push(cardProduct(name, 'invitation-cards', 'Invitations', name));
  });
  ['Certificate A4', 'Certificate Premium'].forEach((name) => {
    products.push(sheetProduct(name, 'certificates', 'Certificates', name));
  });

  // ── Menu & Table (4) ──
  products.push(sheetProduct('Menu Card A4', 'menu-cards', 'Menu', 'A4'));
  products.push(sheetProduct('Menu Card A5', 'menu-cards', 'Menu', 'A5'));
  products.push(sheetProduct('Table Tent Card', 'table-tents', 'Table Tent', 'Standard'));
  products.push(sheetProduct('Table Talker', 'table-tents', 'Table Tent', 'Talker'));

  // ── ID & Bill Books (6) ──
  ['PVC ID Card', 'Employee ID Card', 'Visitor ID Card'].forEach((name) => {
    products.push(cardProduct(name, 'id-cards', 'ID Cards', name, 'VISITING_CARD', 'MINIMAL'));
  });
  ['Bill Book Duplicate', 'Bill Book Triplicate', 'Receipt Voucher Book'].forEach((name) => {
    products.push(sheetProduct(name, 'bill-books', 'Bill Books', name, 'OFFSET_SHEET'));
  });

  // ── Promotional (10) ──
  ['Mouse Pad Print', 'Photo Print 4x6', 'Photo Print 5x7', 'Photo Print A4', 'Acrylic Photo Print', 'Acrylic Standee', 'Photo Frame Print', 'Wall Canvas Premium', 'Desk Calendar', 'Wall Calendar'].forEach(
    (name) => {
      const slug = slugify(name);
      const isPhoto = /photo/i.test(name);
      const isMouse = /mouse/i.test(name);
      const isCanvas = /canvas/i.test(name);
      const isAcrylic = /acrylic/i.test(name);
      const categorySlug = isMouse
        ? 'mouse-pads'
        : isAcrylic
          ? 'acrylic-prints'
          : isCanvas
            ? 'wall-canvas'
            : 'photo-prints';
      products.push({
        name,
        slug,
        categorySlug,
        familyName: 'Promotional',
        familySlug: 'promo-general',
        seriesName: name,
        seriesSlug: `promo-${slug}`,
        shortDescription: 'Min Qty: 1',
        printProfileKey: isPhoto || isCanvas ? 'CANVAS' : 'DIGITAL_SHEET',
        attributeProfileKey: 'MINIMAL',
        tiers: isPhoto
          ? [{ quantity: 1, basePrice: 150 }]
          : [{ quantity: 1, basePrice: 350 }],
      });
    },
  );

  // Deduplicate by slug
  const seen = new Set<string>();
  return products.filter((p) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });
}

export const PRODUCT_CATALOG = buildProductCatalog();
