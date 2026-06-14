/**
 * Seed sample Visiting Card product with dynamic attributes and pricing.
 * Run: npx tsx scripts/seed-visiting-card.ts
 */
import { PrismaClient, ProductStatus, ProductVisibility, ProductOfferingVersionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const printingSlug = 'printing';
  let printing = await prisma.category.findUnique({ where: { slug: printingSlug } });
  if (!printing) {
    printing = await prisma.category.create({
      data: { name: 'Printing', slug: printingSlug, sortOrder: 1 },
    });
  }

  let visitingCards = await prisma.category.findFirst({
    where: { slug: 'visiting-cards', parentId: printing.id },
  });
  if (!visitingCards) {
    visitingCards = await prisma.category.create({
      data: {
        name: 'Visiting Cards',
        slug: 'visiting-cards',
        parentId: printing.id,
        sortOrder: 1,
      },
    });
  }

  const existing = await prisma.productOffering.findUnique({ where: { slug: 'visiting-card' } });
  if (existing) {
    console.log('Visiting Card product already exists:', existing.id);
    return;
  }

  let family = await prisma.productFamily.findFirst({
    where: { categoryId: visitingCards.id, slug: 'visiting-cards-family' },
  });
  if (!family) {
    family = await prisma.productFamily.create({
      data: {
        categoryId: visitingCards.id,
        name: 'Visiting Cards',
        slug: 'visiting-cards-family',
        status: ProductStatus.ACTIVE,
      },
    });
  }

  const series = await prisma.productSeries.create({
    data: {
      familyId: family.id,
      name: 'Visiting Card',
      slug: 'visiting-card-series',
      status: ProductStatus.ACTIVE,
    },
  });

  const offering = await prisma.productOffering.create({
    data: {
      seriesId: series.id,
      name: 'Visiting Card',
      slug: 'visiting-card',
      shortDescription: 'Premium customizable visiting cards',
      description: 'Configure paper, GSM, lamination, foiling, corners and quantity with live pricing.',
      visibility: ProductVisibility.VENDOR_ONLY,
      status: ProductStatus.ACTIVE,
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
    },
  });

  const tiers = [
    { quantity: 100, basePrice: 100 },
    { quantity: 250, basePrice: 220 },
    { quantity: 500, basePrice: 400 },
    { quantity: 1000, basePrice: 700 },
  ];
  for (const t of tiers) {
    await prisma.quantityPricing.create({
      data: {
        productOfferingVersionId: version.id,
        quantity: t.quantity,
        basePrice: t.basePrice,
      },
    });
  }

  const attributes = [
    {
      code: 'paper_type',
      label: 'Paper Type',
      values: [
        { label: 'Art Card', value: 'art_card', price: 0 },
        { label: 'PVC', value: 'pvc', price: 30 },
        { label: 'Premium', value: 'premium', price: 50 },
      ],
    },
    {
      code: 'gsm',
      label: 'Paper GSM',
      values: [
        { label: '300 GSM', value: '300', price: 0 },
        { label: '350 GSM', value: '350', price: 20 },
      ],
    },
    {
      code: 'printing_side',
      label: 'Printing Side',
      values: [
        { label: 'Single Side', value: 'single', price: 0 },
        { label: 'Double Side', value: 'double', price: 50 },
      ],
    },
    {
      code: 'lamination',
      label: 'Lamination',
      values: [
        { label: 'None', value: 'none', price: 0 },
        { label: 'Matte', value: 'matte', price: 30 },
        { label: 'Gloss', value: 'gloss', price: 35 },
      ],
    },
    {
      code: 'foiling',
      label: 'Foiling',
      values: [
        { label: 'None', value: 'none', price: 0 },
        { label: 'Gold', value: 'gold', price: 80 },
        { label: 'Silver', value: 'silver', price: 70 },
      ],
    },
    {
      code: 'corner_type',
      label: 'Corner Type',
      values: [
        { label: 'Normal', value: 'normal', price: 0 },
        { label: 'Rounded', value: 'rounded', price: 15 },
      ],
    },
  ];

  let sortOrder = 0;
  for (const attr of attributes) {
    const field = await prisma.configurationField.create({
      data: {
        productOfferingVersionId: version.id,
        code: attr.code,
        label: attr.label,
        fieldType: 'DROPDOWN',
        isRequired: true,
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
      if (val.price > 0) {
        await prisma.configurationOptionPricing.create({
          data: {
            optionId: option.id,
            adjustmentType: 'FIXED',
            adjustmentValue: val.price,
          },
        });
      }
    }
  }

  console.log('Seeded Visiting Card product:', offering.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
