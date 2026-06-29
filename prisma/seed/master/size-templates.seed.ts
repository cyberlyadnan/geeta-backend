import { MasterConfigStatus, PrintSizeStrategyType } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

type TemplateSeed = {
  code: string;
  name: string;
  strategyType: PrintSizeStrategyType;
  description: string;
  config: Record<string, unknown>;
  sortOrder: number;
  items?: Array<{
    code: string;
    label: string;
    sheetCode?: string;
    width?: number;
    height?: number;
    unitCode?: string;
  }>;
};

export const SIZE_TEMPLATES: TemplateSeed[] = [
  {
    code: 'VISITING_CARD_FIXED',
    name: 'Visiting Card — Fixed Presets',
    strategyType: PrintSizeStrategyType.FIXED_SIZE,
    description: 'Standard business card dimensions (India / EU / US)',
    config: { unit: 'MM' },
    sortOrder: 1,
    items: [
      { code: 'STD_90X54', label: 'Standard India (90×54 mm)', width: 90, height: 54, unitCode: 'MM' },
      { code: 'EU_85X55', label: 'European (85×55 mm)', width: 85, height: 55, unitCode: 'MM' },
      { code: 'US_89X51', label: 'US Standard (89×51 mm)', width: 89, height: 51, unitCode: 'MM' },
      { code: 'SQ_55X55', label: 'Square (55×55 mm)', width: 55, height: 55, unitCode: 'MM' },
    ],
  },
  {
    code: 'DIGITAL_SHEET_SIZES',
    name: 'Digital — Sheet Based',
    strategyType: PrintSizeStrategyType.SHEET_BASED,
    description: 'ISO and commercial digital sheet sizes',
    config: {},
    sortOrder: 2,
    items: [
      { code: 'A4', label: 'A4', sheetCode: 'A4' },
      { code: 'A3', label: 'A3', sheetCode: 'A3' },
      { code: 'A5', label: 'A5', sheetCode: 'A5' },
      { code: 'SRA3', label: 'SRA3', sheetCode: 'SRA3' },
      { code: '12X18', label: '12×18', sheetCode: '12X18' },
      { code: '13X19', label: '13×19', sheetCode: '13X19' },
    ],
  },
  {
    code: 'OFFSET_SHEET_SIZES',
    name: 'Offset — Sheet Based',
    strategyType: PrintSizeStrategyType.SHEET_BASED,
    description: 'Offset press sheet sizes',
    config: {},
    sortOrder: 3,
    items: [
      { code: 'A4', label: 'A4', sheetCode: 'A4' },
      { code: 'A3', label: 'A3', sheetCode: 'A3' },
      { code: 'A2', label: 'A2', sheetCode: 'A2' },
      { code: 'SRA3', label: 'SRA3', sheetCode: 'SRA3' },
    ],
  },
  {
    code: 'FLEX_CUSTOM',
    name: 'Flex — Custom Size',
    strategyType: PrintSizeStrategyType.CUSTOM_SIZE,
    description: 'Custom width × height for flex / vinyl banners',
    config: { minWidthMm: 305, maxWidthMm: 5000, minHeightMm: 305, maxHeightMm: 15000, unit: 'MM' },
    sortOrder: 4,
  },
  {
    code: 'CANVAS_CUSTOM',
    name: 'Canvas — Custom Size',
    strategyType: PrintSizeStrategyType.CUSTOM_SIZE,
    description: 'Gallery canvas custom dimensions',
    config: { minWidthMm: 200, maxWidthMm: 3000, minHeightMm: 200, maxHeightMm: 3000, unit: 'MM' },
    sortOrder: 5,
  },
  {
    code: 'LARGE_FORMAT_AREA',
    name: 'Large Format — Area Based',
    strategyType: PrintSizeStrategyType.AREA_BASED,
    description: 'Posters and boards priced by sq ft',
    config: { unit: 'SQFT', minAreaSqFt: 1, maxAreaSqFt: 500 },
    sortOrder: 6,
  },
  {
    code: 'ROLL_PRINT',
    name: 'Roll — Roll Based',
    strategyType: PrintSizeStrategyType.ROLL_BASED,
    description: 'Labels and continuous roll print',
    config: { rollWidthsMm: [305, 610, 914, 1270], variableHeight: true },
    sortOrder: 7,
  },
  {
    code: 'LABEL_FIXED',
    name: 'Labels — Fixed Sizes',
    strategyType: PrintSizeStrategyType.FIXED_SIZE,
    description: 'Common label die sizes',
    config: { unit: 'MM' },
    sortOrder: 8,
    items: [
      { code: 'LBL_50X25', label: '50×25 mm', width: 50, height: 25, unitCode: 'MM' },
      { code: 'LBL_75X50', label: '75×50 mm', width: 75, height: 50, unitCode: 'MM' },
      { code: 'LBL_100X50', label: '100×50 mm', width: 100, height: 50, unitCode: 'MM' },
      { code: 'LBL_A4SHEET', label: 'A4 Sheet (multi-up)', sheetCode: 'A4' },
    ],
  },
  {
    code: 'PACKAGING_CUSTOM',
    name: 'Packaging — Custom Flat Size',
    strategyType: PrintSizeStrategyType.CUSTOM_SIZE,
    description: 'Dieline flat dimensions for cartons and bags',
    config: { minWidthMm: 100, maxWidthMm: 2000, minHeightMm: 100, maxHeightMm: 2000, unit: 'MM' },
    sortOrder: 9,
  },
  {
    code: 'COVERAGE_UV',
    name: 'Coverage — Spot UV / Foil',
    strategyType: PrintSizeStrategyType.COVERAGE_BASED,
    description: 'Card size + separate coverage mask pricing',
    config: { baseStrategy: 'FIXED_SIZE', unit: 'MM' },
    sortOrder: 10,
    items: [
      { code: 'STD_90X54', label: 'Standard (90×54 mm)', width: 90, height: 54, unitCode: 'MM' },
    ],
  },
];

export async function seedSizeTemplates(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('size-templates');

  for (const template of SIZE_TEMPLATES) {
    const { items, ...rest } = template;
    const row = await ctx.prisma.sizeTemplate.upsert({
      where: { code: template.code },
      update: {
        name: rest.name,
        strategyType: rest.strategyType,
        config: rest.config,
        description: rest.description,
        sortOrder: rest.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: rest.code,
        name: rest.name,
        strategyType: rest.strategyType,
        config: rest.config,
        description: rest.description,
        sortOrder: rest.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });

    if (items?.length) {
      await ctx.prisma.sizeTemplateItem.deleteMany({ where: { sizeTemplateId: row.id } });
      for (const [idx, item] of items.entries()) {
        await ctx.prisma.sizeTemplateItem.create({
          data: {
            sizeTemplateId: row.id,
            sheetSizeId: item.sheetCode ? ctx.registry.sheetSizes.get(item.sheetCode) : undefined,
            code: item.code,
            label: item.label,
            width: item.width,
            height: item.height,
            unitCode: item.unitCode,
            sortOrder: idx,
            isActive: true,
          },
        });
      }
    }

    ctx.registry.sizeTemplates.set(template.code, row.id);
  }
  log.info(`Upserted ${SIZE_TEMPLATES.length} size templates`);
}
