/**
 * Seed printing services catalog (Printers Club style).
 * Run: npx tsx scripts/seed-printing-catalog.ts
 */
import {
  PrismaClient,
  ProductStatus,
  ProductVisibility,
  ProductOfferingVersionStatus,
  PricingAdjustmentType,
} from '@prisma/client';

const prisma = new PrismaClient();

const IMG = {
  visitingCard:
    'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=600&h=400&fit=crop',
  metalCard:
    'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=400&fit=crop',
  premiumCard:
    'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&h=400&fit=crop',
  printService:
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400&h=300&fit=crop',
  letterhead:
    'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=400&h=300&fit=crop',
  envelope:
    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=300&fit=crop',
};

const PRINTING_SERVICES = [
  { name: 'Visiting Cards', slug: 'visiting-cards', imageUrl: IMG.visitingCard, sortOrder: 1 },
  { name: 'Card Holders', slug: 'card-holders', imageUrl: IMG.printService, sortOrder: 2 },
  { name: 'Pamphlet / Posters', slug: 'pamphlet-posters', imageUrl: IMG.printService, sortOrder: 3 },
  { name: 'Tags', slug: 'tags', imageUrl: IMG.printService, sortOrder: 4 },
  { name: 'Files', slug: 'files', imageUrl: IMG.printService, sortOrder: 5 },
  { name: 'Letter Heads', slug: 'letter-heads', imageUrl: IMG.letterhead, sortOrder: 6 },
  { name: 'Envelopes', slug: 'envelopes', imageUrl: IMG.envelope, sortOrder: 7 },
  { name: 'Digital Paper Printing', slug: 'digital-paper-printing', imageUrl: IMG.printService, sortOrder: 8 },
  { name: 'ATM Pouches', slug: 'atm-pouches', imageUrl: IMG.printService, sortOrder: 9 },
  { name: 'Sample Files', slug: 'sample-files', imageUrl: IMG.printService, sortOrder: 10 },
] as const;

type ProductSeed = {
  name: string;
  slug: string;
  displayName: string;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  minQty: number;
  basePrice: number;
  productCode: string;
  groupLabel: string;
  groupColor: 'red' | 'blue' | 'orange';
  attributes: Array<{
    code: string;
    label: string;
    values: Array<{ label: string; value: string; price?: number }>;
  }>;
};

const VISITING_CARD_GROUPS = [
  {
    name: 'Metal Visiting Cards',
    slug: 'metal-visiting-cards',
    headerNote: 'QTY. 50 CARDS',
    color: 'red' as const,
    products: [
      {
        name: 'Metal Cards',
        slug: 'metal-cards',
        displayName: 'METAL CARDS',
        productCode: '1',
        minQty: 50,
        basePrice: 2500,
        specs: [
          'Sheet Color: 8 Types',
          'Die Cut Option: Any Shape',
          'Production Time: 3 day',
          'Note: Reserved for top management of ROC-registered companies.',
        ],
        thumbnailUrl: IMG.metalCard,
      },
    ],
  },
  {
    name: '800 GSM Visiting Cards',
    slug: '800-gsm-visiting-cards',
    headerNote: 'QTY. 500 CARDS',
    color: 'blue' as const,
    products: [
      {
        name: '800 GSM + Velvet',
        slug: '800-gsm-velvet',
        displayName: '800 GSM + VELVET',
        productCode: '2',
        minQty: 500,
        basePrice: 4000,
        specs: [
          'Lamination Type: Velvet',
          'UV Option: Available',
          'Foil Option: Available (5 Types)',
          'Die Cut Option: Available (36 Types)',
          'Production Time: 3 days',
        ],
        thumbnailUrl: IMG.premiumCard,
      },
      {
        name: '800 GSM + Velvet + UV + Foil',
        slug: '800-gsm-velvet-uv-foil',
        displayName: '800 GSM + Velvet + UV + Foil',
        productCode: '2-A',
        minQty: 500,
        basePrice: 5200,
        specs: [
          'Product Class: Super Premium (Unique)',
          'Paper Quality: Imported 800 GSM Art Paper',
          'Lamination Type: Velvet',
          'Production Time: 3 days',
        ],
        thumbnailUrl: IMG.premiumCard,
      },
      {
        name: '800 GSM + Velvet + UV + Foil + Die Cut',
        slug: '800-gsm-velvet-uv-foil-diecut',
        displayName: '800 GSM + Velvet + UV + Foil + Die Cut',
        productCode: '2-B',
        minQty: 500,
        basePrice: 5800,
        specs: [
          'Die Cut Option: Available (36 Types)',
          'UV Option: Available',
          'Foil Option: Available (5 Types)',
          'Production Time: 3 days',
        ],
        thumbnailUrl: IMG.premiumCard,
      },
      {
        name: '800 GSM + Matt',
        slug: '800-gsm-matt',
        displayName: '800 GSM + MATT',
        productCode: '3',
        minQty: 500,
        basePrice: 3800,
        specs: [
          'Lamination Type: Matt',
          'UV Option: Available',
          'Foil Option: Available',
          'Die Cut Option: Available (36 Types)',
          'Production Time: 3 days',
        ],
        thumbnailUrl: IMG.visitingCard,
      },
      {
        name: '800 GSM + Texture',
        slug: '800-gsm-texture',
        displayName: '800 GSM + TEXTURE',
        productCode: '6',
        minQty: 500,
        basePrice: 4200,
        specs: [
          'Lamination Type: Matt',
          'Texture Option: Available (8 Types)',
          'Die Cut Option: Available (36 Types)',
          'Production Time: 3 days',
        ],
        thumbnailUrl: IMG.visitingCard,
      },
    ],
  },
  {
    name: '500 GSM Cards',
    slug: '500-gsm-cards',
    headerNote: 'QTY. 500 CARDS',
    color: 'orange' as const,
    products: [
      {
        name: '500 GSM + Matt',
        slug: '500-gsm-matt',
        displayName: '500 GSM + MATT',
        productCode: '7',
        minQty: 500,
        basePrice: 2800,
        specs: [
          'Lamination Type: Matt',
          'UV Option: Available',
          'Production Time: 2 days',
        ],
        thumbnailUrl: IMG.visitingCard,
      },
      {
        name: '500 GSM + Gloss',
        slug: '500-gsm-gloss',
        displayName: '500 GSM + GLOSS',
        productCode: '8',
        minQty: 500,
        basePrice: 3000,
        specs: [
          'Lamination Type: Gloss',
          'UV Option: Available',
          'Production Time: 2 days',
        ],
        thumbnailUrl: IMG.visitingCard,
      },
    ],
  },
];

const STANDARD_VC_ATTRIBUTES = [
  {
    code: 'printing',
    label: 'Printing',
    values: [
      { label: 'Single Side', value: 'single' },
      { label: 'Double Side', value: 'double', price: 200 },
    ],
  },
  {
    code: 'spot_uv',
    label: 'Spot UV',
    values: [
      { label: 'Not Required', value: 'none' },
      { label: 'Required', value: 'required', price: 350 },
    ],
  },
  {
    code: 'foil',
    label: 'Foil',
    values: [
      { label: 'Not Required', value: 'none' },
      { label: 'Required', value: 'required', price: 450 },
    ],
  },
  {
    code: 'foil_color',
    label: 'Foil Color',
    values: [
      { label: 'Gold', value: 'gold' },
      { label: 'Silver', value: 'silver' },
      { label: 'Rose Gold', value: 'rose_gold', price: 80 },
      { label: 'Copper', value: 'copper', price: 80 },
      { label: 'Black', value: 'black', price: 60 },
    ],
  },
  {
    code: 'privacy_packing',
    label: 'Privacy Packing',
    values: [
      { label: 'Not Required', value: 'not_required' },
      { label: 'Required', value: 'required', price: 150 },
    ],
  },
];

async function upsertCategory(data: {
  name: string;
  slug: string;
  parentId?: string | null;
  imageUrl?: string;
  sortOrder?: number;
}) {
  return prisma.category.upsert({
    where: { slug: data.slug },
    create: {
      name: data.name,
      slug: data.slug,
      parentId: data.parentId ?? null,
      imageUrl: data.imageUrl,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    },
    update: {
      name: data.name,
      parentId: data.parentId ?? null,
      imageUrl: data.imageUrl,
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
      deletedAt: null,
    },
  });
}

async function createProduct(
  categoryId: string,
  seed: ProductSeed,
) {
  const existing = await prisma.productOffering.findUnique({ where: { slug: seed.slug } });
  if (existing) {
    console.log(`  skip (exists): ${seed.name}`);
    return existing;
  }

  let family = await prisma.productFamily.findFirst({
    where: { categoryId, slug: `${seed.slug}-family` },
  });
  if (!family) {
    family = await prisma.productFamily.create({
      data: {
        categoryId,
        name: seed.name,
        slug: `${seed.slug}-family`,
        status: ProductStatus.ACTIVE,
      },
    });
  }

  const series = await prisma.productSeries.create({
    data: {
      familyId: family.id,
      name: seed.name,
      slug: `${seed.slug}-series`,
      status: ProductStatus.ACTIVE,
    },
  });

  const offering = await prisma.productOffering.create({
    data: {
      seriesId: series.id,
      name: seed.name,
      slug: seed.slug,
      displayName: seed.displayName,
      shortDescription: seed.shortDescription,
      description: seed.description,
      thumbnailUrl: seed.thumbnailUrl,
      thumbnailKey: `seed/${seed.slug}`,
      visibility: ProductVisibility.VENDOR_ONLY,
      status: ProductStatus.ACTIVE,
      isFeatured: true,
    },
  });

  const version = await prisma.productOfferingVersion.create({
    data: {
      productOfferingId: offering.id,
      versionNumber: 1,
      versionLabel: 'v1',
      status: ProductOfferingVersionStatus.ACTIVE,
      isCurrent: true,
      publishedAt: new Date(),
      metadata: {
        productCode: seed.productCode,
        groupLabel: seed.groupLabel,
        groupColor: seed.groupColor,
        minQty: seed.minQty,
      },
    },
  });

  await prisma.quantityPricing.create({
    data: {
      productOfferingVersionId: version.id,
      quantity: seed.minQty,
      basePrice: seed.basePrice,
    },
  });

  let sortOrder = 0;
  for (const attr of seed.attributes) {
    const field = await prisma.configurationField.create({
      data: {
        productOfferingVersionId: version.id,
        code: attr.code,
        label: attr.label,
        fieldType: 'DROPDOWN',
        isRequired: attr.code !== 'foil_color',
        sortOrder: sortOrder++,
      },
    });

    let valOrder = 0;
    for (const val of attr.values) {
      const option = await prisma.configurationOption.create({
        data: {
          fieldId: field.id,
          label: val.label,
          value: val.value,
          sortOrder: valOrder++,
          isDefault: valOrder === 1,
        },
      });
      if (val.price && val.price > 0) {
        await prisma.configurationOptionPricing.create({
          data: {
            optionId: option.id,
            adjustmentType: PricingAdjustmentType.FIXED,
            adjustmentValue: val.price,
          },
        });
      }
    }
  }

  await prisma.productImage.create({
    data: {
      productOfferingId: offering.id,
      imageUrl: seed.thumbnailUrl,
      imageKey: `seed/${seed.slug}/main`,
      altText: seed.name,
      sortOrder: 0,
      isThumbnail: true,
    },
  });

  console.log(`  created: ${seed.name}`);
  return offering;
}

async function main() {
  console.log('Seeding printing services...');

  for (const svc of PRINTING_SERVICES) {
    await upsertCategory({
      name: svc.name,
      slug: svc.slug,
      imageUrl: svc.imageUrl,
      sortOrder: svc.sortOrder,
    });
    console.log(`Category: ${svc.name}`);
  }

  const visitingCards = await prisma.category.findUniqueOrThrow({
    where: { slug: 'visiting-cards' },
  });

  console.log('\nSeeding visiting card product groups...');

  for (const group of VISITING_CARD_GROUPS) {
    const subCat = await upsertCategory({
      name: group.name,
      slug: group.slug,
      parentId: visitingCards.id,
      imageUrl: group.products[0]?.thumbnailUrl,
      sortOrder: VISITING_CARD_GROUPS.indexOf(group) + 1,
    });

    for (const p of group.products) {
      const description = p.specs.join('\n');
      await createProduct(subCat.id, {
        name: p.name,
        slug: p.slug,
        displayName: p.displayName,
        shortDescription: `${group.name} — Min Qty: ${p.minQty}`,
        description,
        thumbnailUrl: p.thumbnailUrl,
        minQty: p.minQty,
        basePrice: p.basePrice,
        productCode: p.productCode,
        groupLabel: `${group.name.toUpperCase()} (${group.headerNote})`,
        groupColor: group.color,
        attributes: [
          {
            code: 'quantity',
            label: 'Quantity',
            values: [{ label: String(p.minQty), value: String(p.minQty) }],
          },
          ...STANDARD_VC_ATTRIBUTES,
        ],
      });
    }
  }

  console.log('\nPrinting catalog seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
