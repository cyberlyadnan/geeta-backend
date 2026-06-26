/**
 * Seeds print master configuration + demo products for order flow testing.
 * Invoked from prisma/seed.ts via npm run prisma:seed
 */
import {
  PrismaClient,
  ProductOfferingVersionStatus,
  ProductStatus,
  ProductVisibility,
  PrintColorMode,
  PrintSizeStrategyType,
  SheetType,
} from '@prisma/client';

const prisma = new PrismaClient();

const UNITS = [
  { code: 'MM', name: 'Millimeter', symbol: 'mm', toMmFactor: 1, sortOrder: 1 },
  { code: 'CM', name: 'Centimeter', symbol: 'cm', toMmFactor: 10, sortOrder: 2 },
  { code: 'INCH', name: 'Inch', symbol: 'in', toMmFactor: 25.4, sortOrder: 3 },
  { code: 'FT', name: 'Feet', symbol: 'ft', toMmFactor: 304.8, sortOrder: 4 },
  { code: 'M', name: 'Meter', symbol: 'm', toMmFactor: 1000, sortOrder: 5 },
  { code: 'PX', name: 'Pixel', symbol: 'px', toMmFactor: 0.264583, sortOrder: 6 },
] as const;

const SHEET_SIZES = [
  { code: 'A5', name: 'A5', width: 148, height: 210 },
  { code: 'A4', name: 'A4', width: 210, height: 297 },
  { code: 'A3', name: 'A3', width: 297, height: 420 },
  { code: '12X18', name: '12 × 18', width: 305, height: 457 },
  { code: '13X19', name: '13 × 19', width: 330, height: 483 },
  { code: 'SRA3', name: 'SRA3', width: 320, height: 450 },
  { code: '18X24', name: '18 × 24', width: 457, height: 610 },
  { code: '24X36', name: '24 × 36', width: 610, height: 914 },
  { code: '36X48', name: '36 × 48', width: 914, height: 1219 },
] as const;

const PRINT_PROCESSES = [
  { code: 'DIGITAL', name: 'Digital Printing', pricingStrategyKey: 'digital_standard' },
  { code: 'OFFSET', name: 'Offset Printing', pricingStrategyKey: 'offset_standard' },
  { code: 'FLEX', name: 'Flex Printing', pricingStrategyKey: 'flex_area' },
  { code: 'VINYL', name: 'Vinyl Printing', pricingStrategyKey: 'vinyl_area' },
  { code: 'SPOT_UV', name: 'Spot UV', pricingStrategyKey: 'spot_uv_coverage' },
  { code: 'RAISED_UV', name: 'Raised UV', pricingStrategyKey: 'raised_uv_coverage' },
  { code: 'WHITE_INK', name: 'White Ink', pricingStrategyKey: 'white_ink' },
  { code: 'FOILING', name: 'Foiling', pricingStrategyKey: 'foil_coverage' },
  { code: 'EMBOSSING', name: 'Embossing', pricingStrategyKey: 'emboss' },
  { code: 'DEBOSSING', name: 'Debossing', pricingStrategyKey: 'deboss' },
  { code: 'SCREEN', name: 'Screen Printing', pricingStrategyKey: 'screen_standard' },
  { code: 'LASER_CUT', name: 'Laser Cutting', pricingStrategyKey: 'laser_cut' },
] as const;

export async function seedPrintMasters(client?: PrismaClient): Promise<void> {
  const db = client ?? prisma;
  console.log('Seeding print master configuration…');

  const unitMap: Record<string, string> = {};
  for (const u of UNITS) {
    const row = await db.measurementUnit.upsert({
      where: { code: u.code },
      update: {
        name: u.name,
        symbol: u.symbol,
        toMmFactor: u.toMmFactor,
        sortOrder: u.sortOrder,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: { ...u, status: 'ACTIVE' },
    });
    unitMap[u.code] = row.id;
  }

  const sheetMap: Record<string, string> = {};
  for (const [idx, s] of SHEET_SIZES.entries()) {
    const row = await db.sheetSize.upsert({
      where: { code: s.code },
      update: {
        name: s.name,
        width: s.width,
        height: s.height,
        measurementUnitId: unitMap.MM,
        aspectRatio: s.width / s.height,
        sheetType: SheetType.PAPER,
        sortOrder: idx + 1,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        code: s.code,
        name: s.name,
        width: s.width,
        height: s.height,
        measurementUnitId: unitMap.MM,
        aspectRatio: s.width / s.height,
        sheetType: SheetType.PAPER,
        sortOrder: idx + 1,
        status: 'ACTIVE',
      },
    });
    sheetMap[s.code] = row.id;
  }

  const digitalTemplate = await db.sizeTemplate.upsert({
    where: { code: 'DIGITAL_SIZES' },
    update: {
      name: 'Digital Printing Sizes',
      strategyType: PrintSizeStrategyType.SHEET_BASED,
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      code: 'DIGITAL_SIZES',
      name: 'Digital Printing Sizes',
      strategyType: PrintSizeStrategyType.SHEET_BASED,
      config: {},
      description: 'Standard sheet sizes for digital printing',
      sortOrder: 1,
      status: 'ACTIVE',
    },
  });

  await db.sizeTemplateItem.deleteMany({ where: { sizeTemplateId: digitalTemplate.id } });
  const digitalSizes = ['A4', 'A3', '12X18', '13X19'] as const;
  for (const [idx, code] of digitalSizes.entries()) {
    await db.sizeTemplateItem.create({
      data: {
        sizeTemplateId: digitalTemplate.id,
        sheetSizeId: sheetMap[code],
        code,
        label: SHEET_SIZES.find((s) => s.code === code)!.name,
        sortOrder: idx,
      },
    });
  }

  const flexTemplate = await db.sizeTemplate.upsert({
    where: { code: 'FLEX_CUSTOM' },
    update: {
      name: 'Flex Custom Size',
      strategyType: PrintSizeStrategyType.CUSTOM_SIZE,
      config: { minWidth: 305, maxWidth: 1524, minHeight: 305, maxHeight: 3048, unit: 'MM' },
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      code: 'FLEX_CUSTOM',
      name: 'Flex Custom Size',
      strategyType: PrintSizeStrategyType.CUSTOM_SIZE,
      config: { minWidth: 305, maxWidth: 1524, minHeight: 305, maxHeight: 3048, unit: 'MM' },
      description: 'Custom width/height for flex printing',
      sortOrder: 2,
      status: 'ACTIVE',
    },
  });

  await db.sizeTemplate.upsert({
    where: { code: 'ROLL_PRINT' },
    update: {
      name: 'Roll Printing',
      strategyType: PrintSizeStrategyType.ROLL_BASED,
      config: { rollWidthsMm: [610, 914, 1270], variableHeight: true },
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      code: 'ROLL_PRINT',
      name: 'Roll Printing',
      strategyType: PrintSizeStrategyType.ROLL_BASED,
      config: { rollWidthsMm: [610, 914, 1270], variableHeight: true },
      sortOrder: 3,
      status: 'ACTIVE',
    },
  });

  const visitingCardSpec = await db.printSpecificationTemplate.upsert({
    where: { code: 'VISITING_CARD_STD' },
    update: {
      name: 'Visiting Card Standard',
      finishedWidthMm: 90,
      finishedHeightMm: 54,
      artworkWidthMm: 94,
      artworkHeightMm: 58,
      bleedMm: 2,
      safeAreaMm: 3,
      minDpi: 300,
      maxFileSizeMb: 50,
      allowedFormats: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      colorMode: PrintColorMode.CMYK,
      previewEnabled: true,
      validationEnabled: true,
      autoArtworkAnalysis: true,
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      code: 'VISITING_CARD_STD',
      name: 'Visiting Card Standard',
      finishedWidthMm: 90,
      finishedHeightMm: 54,
      artworkWidthMm: 94,
      artworkHeightMm: 58,
      bleedMm: 2,
      safeAreaMm: 3,
      minDpi: 300,
      maxFileSizeMb: 50,
      allowedFormats: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      colorMode: PrintColorMode.CMYK,
      previewEnabled: true,
      validationEnabled: true,
      autoArtworkAnalysis: true,
      sortOrder: 1,
      status: 'ACTIVE',
    },
  });

  const digitalSpec = await db.printSpecificationTemplate.upsert({
    where: { code: 'DIGITAL_A4' },
    update: {
      name: 'Digital A4 Standard',
      finishedWidthMm: 210,
      finishedHeightMm: 297,
      artworkWidthMm: 216,
      artworkHeightMm: 303,
      bleedMm: 3,
      safeAreaMm: 5,
      minDpi: 300,
      maxFileSizeMb: 100,
      allowedFormats: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      colorMode: PrintColorMode.ANY,
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      code: 'DIGITAL_A4',
      name: 'Digital A4 Standard',
      finishedWidthMm: 210,
      finishedHeightMm: 297,
      artworkWidthMm: 216,
      artworkHeightMm: 303,
      bleedMm: 3,
      safeAreaMm: 5,
      minDpi: 300,
      maxFileSizeMb: 100,
      allowedFormats: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      colorMode: PrintColorMode.ANY,
      sortOrder: 2,
      status: 'ACTIVE',
    },
  });

  const flexSpec = await db.printSpecificationTemplate.upsert({
    where: { code: 'FLEX_LARGE' },
    update: {
      name: 'Flex Large Format',
      minDpi: 72,
      maxFileSizeMb: 200,
      allowedFormats: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      coverageAnalysisEnabled: true,
      status: 'ACTIVE',
      deletedAt: null,
    },
    create: {
      code: 'FLEX_LARGE',
      name: 'Flex Large Format',
      minDpi: 72,
      maxFileSizeMb: 200,
      allowedFormats: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      coverageAnalysisEnabled: true,
      sortOrder: 3,
      status: 'ACTIVE',
    },
  });

  const artworkRule = await db.masterArtworkRule.upsert({
    where: { code: 'ARTWORK_STD' },
    update: { status: 'ACTIVE', deletedAt: null },
    create: {
      code: 'ARTWORK_STD',
      name: 'Standard Artwork Rules',
      ruleType: 'FILE_VALIDATION',
      config: {
        allowedExtensions: ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg'],
        maxFileSizeMb: 100,
        minResolution: 300,
        transparencyAllowed: true,
        multiplePages: true,
        rotationAllowed: true,
      },
      failLevel: 'ERROR',
      sortOrder: 1,
      status: 'ACTIVE',
    },
  });

  const dimValidation = await db.masterValidationRule.upsert({
    where: { code: 'DIMENSION_CHECK' },
    update: { status: 'ACTIVE', deletedAt: null },
    create: {
      code: 'DIMENSION_CHECK',
      name: 'Dimension Validation',
      ruleType: 'DIMENSION',
      config: { toleranceMm: 1 },
      failLevel: 'ERROR',
      sortOrder: 1,
      status: 'ACTIVE',
    },
  });

  const dpiValidation = await db.masterValidationRule.upsert({
    where: { code: 'RESOLUTION_CHECK' },
    update: { status: 'ACTIVE', deletedAt: null },
    create: {
      code: 'RESOLUTION_CHECK',
      name: 'Resolution Validation',
      ruleType: 'RESOLUTION',
      config: { minDpi: 300 },
      warningThreshold: 250,
      errorThreshold: 200,
      failLevel: 'WARNING',
      sortOrder: 2,
      status: 'ACTIVE',
    },
  });

  const uvCoverage = await db.masterCoverageRule.upsert({
    where: { code: 'SPOT_UV_STD' },
    update: { status: 'ACTIVE', deletedAt: null },
    create: {
      code: 'SPOT_UV_STD',
      name: 'Spot UV Coverage',
      coverageType: 'SPOT_UV',
      pricePerCm2: 2.5,
      minCharge: 50,
      supportedFileTypes: ['PDF', 'AI', 'PSD'],
      sortOrder: 1,
      status: 'ACTIVE',
    },
  });

  const fileUploadRule = await db.fileUploadRuleTemplate.upsert({
    where: { code: 'ARTWORK_MAIN' },
    update: { status: 'ACTIVE', deletedAt: null },
    create: {
      code: 'ARTWORK_MAIN',
      name: 'Main Artwork Upload',
      requirementType: 'REQUIRED',
      maxFileSizeMb: 100,
      allowMultiple: false,
      allowedFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
      sortOrder: 1,
      status: 'ACTIVE',
    },
  });

  const processMap: Record<string, string> = {};
  for (const [idx, p] of PRINT_PROCESSES.entries()) {
    const defaultTemplateId =
      p.code === 'FLEX' || p.code === 'VINYL' ? flexTemplate.id : digitalTemplate.id;

    const row = await db.printProcess.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        pricingStrategyKey: p.pricingStrategyKey,
        defaultSizeTemplateId: defaultTemplateId,
        supportedFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
        supportedSizeStrategies: ['SHEET_BASED', 'CUSTOM_SIZE', 'ROLL_BASED'],
        supportedValidationTypes: ['DIMENSION', 'RESOLUTION', 'BLEED', 'SAFE_AREA'],
        sortOrder: idx + 1,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        code: p.code,
        name: p.name,
        pricingStrategyKey: p.pricingStrategyKey,
        defaultSizeTemplateId: defaultTemplateId,
        supportedFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'],
        supportedSizeStrategies: ['SHEET_BASED', 'CUSTOM_SIZE', 'ROLL_BASED'],
        supportedValidationTypes: ['DIMENSION', 'RESOLUTION', 'BLEED', 'SAFE_AREA'],
        sortOrder: idx + 1,
        status: 'ACTIVE',
      },
    });
    processMap[p.code] = row.id;
  }

  let series = await db.productSeries.findFirst({ where: { slug: 'digital-printing' } });
  if (!series) {
    const category = await db.category.upsert({
      where: { slug: 'printing-services' },
      update: {},
      create: {
        name: 'Printing Services',
        slug: 'printing-services',
        sortOrder: 1,
        isActive: true,
      },
    });
    const family = await db.productFamily.upsert({
      where: { slug: 'digital-printing-family' },
      update: {},
      create: {
        categoryId: category.id,
        name: 'Digital Printing',
        slug: 'digital-printing-family',
        sortOrder: 1,
        status: ProductStatus.ACTIVE,
        isActive: true,
      },
    });
    series = await db.productSeries.create({
      data: {
        familyId: family.id,
        name: 'Digital Printing',
        slug: 'digital-printing',
        sortOrder: 1,
        status: ProductStatus.ACTIVE,
        isActive: true,
      },
    });
  }

  const DEMO_PRODUCTS = [
    {
      name: 'Visiting Card',
      slug: 'demo-visiting-card',
      process: 'DIGITAL',
      template: digitalTemplate.id,
      spec: visitingCardSpec.id,
      basePrice: 500,
      minQty: 100,
    },
    {
      name: 'Brochure',
      slug: 'demo-brochure',
      process: 'DIGITAL',
      template: digitalTemplate.id,
      spec: digitalSpec.id,
      basePrice: 800,
      minQty: 50,
    },
    {
      name: 'Letter Head',
      slug: 'demo-letter-head',
      process: 'DIGITAL',
      template: digitalTemplate.id,
      spec: digitalSpec.id,
      basePrice: 600,
      minQty: 100,
    },
    {
      name: 'Sticker',
      slug: 'demo-sticker',
      process: 'DIGITAL',
      template: digitalTemplate.id,
      spec: digitalSpec.id,
      basePrice: 300,
      minQty: 100,
    },
    {
      name: 'Banner',
      slug: 'demo-banner',
      process: 'FLEX',
      template: flexTemplate.id,
      spec: flexSpec.id,
      basePrice: 1200,
      minQty: 1,
    },
    {
      name: 'Flex',
      slug: 'demo-flex',
      process: 'FLEX',
      template: flexTemplate.id,
      spec: flexSpec.id,
      basePrice: 1500,
      minQty: 1,
    },
    {
      name: 'Spot UV Card',
      slug: 'demo-spot-uv-card',
      process: 'SPOT_UV',
      template: digitalTemplate.id,
      spec: visitingCardSpec.id,
      basePrice: 2500,
      minQty: 100,
      coverageIds: [uvCoverage.id],
    },
  ] as const;

  const ruleIds = {
    artwork: [artworkRule.id],
    validation: [dimValidation.id, dpiValidation.id],
    coverage: [uvCoverage.id],
  };

  for (const [idx, prod] of DEMO_PRODUCTS.entries()) {
    const offering = await db.productOffering.upsert({
      where: { slug: prod.slug },
      update: {
        name: prod.name,
        displayName: prod.name,
        status: ProductStatus.ACTIVE,
        isActive: true,
        visibility: ProductVisibility.VENDOR_ONLY,
        sortOrder: idx + 1,
      },
      create: {
        seriesId: series.id,
        name: prod.name,
        slug: prod.slug,
        displayName: prod.name,
        shortDescription: `${prod.name} — demo product with master print configuration`,
        status: ProductStatus.ACTIVE,
        visibility: ProductVisibility.VENDOR_ONLY,
        sortOrder: idx + 1,
        isActive: true,
      },
    });

    let version = await db.productOfferingVersion.findFirst({
      where: { productOfferingId: offering.id, isCurrent: true },
    });

    if (!version) {
      version = await db.productOfferingVersion.create({
        data: {
          productOfferingId: offering.id,
          versionNumber: 1,
          versionLabel: 'v1',
          status: ProductOfferingVersionStatus.PUBLISHED,
          isCurrent: true,
          publishedAt: new Date(),
          printProcessId: processMap[prod.process],
          sizeTemplateId: prod.template,
          printSpecificationTemplateId: prod.spec,
        },
      });
    } else {
      version = await db.productOfferingVersion.update({
        where: { id: version.id },
        data: {
          printProcessId: processMap[prod.process],
          sizeTemplateId: prod.template,
          printSpecificationTemplateId: prod.spec,
          status: ProductOfferingVersionStatus.PUBLISHED,
        },
      });
    }

    const coverageIds = 'coverageIds' in prod ? [...prod.coverageIds] : ruleIds.coverage;

    await db.productPrintConfig.upsert({
      where: { productOfferingVersionId: version.id },
      update: {
        printProcessId: processMap[prod.process],
        sizeTemplateId: prod.template,
        printSpecificationTemplateId: prod.spec,
        fileUploadRuleTemplateId: fileUploadRule.id,
        artworkRuleIds: ruleIds.artwork,
        validationRuleIds: ruleIds.validation,
        coverageRuleIds: coverageIds,
        pricingStrategyKey: PRINT_PROCESSES.find((p) => p.code === prod.process)?.pricingStrategyKey,
      },
      create: {
        productOfferingVersionId: version.id,
        printProcessId: processMap[prod.process],
        sizeTemplateId: prod.template,
        printSpecificationTemplateId: prod.spec,
        fileUploadRuleTemplateId: fileUploadRule.id,
        artworkRuleIds: ruleIds.artwork,
        validationRuleIds: ruleIds.validation,
        coverageRuleIds: coverageIds,
        pricingStrategyKey: PRINT_PROCESSES.find((p) => p.code === prod.process)?.pricingStrategyKey,
      },
    });

    const existingPricing = await db.quantityPricing.findFirst({
      where: { productOfferingVersionId: version.id },
    });
    if (!existingPricing) {
      await db.quantityPricing.create({
        data: {
          productOfferingVersionId: version.id,
          quantity: prod.minQty,
          basePrice: prod.basePrice,
          isActive: true,
        },
      });
    }
  }

  console.log(
    `Print masters seeded: ${UNITS.length} units, ${SHEET_SIZES.length} sheet sizes, ${PRINT_PROCESSES.length} processes, ${DEMO_PRODUCTS.length} demo products`,
  );
}
