import { MasterConfigStatus, SheetType } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

type SheetSeed = {
  code: string;
  name: string;
  width: number;
  height: number;
  sheetType: SheetType;
  description: string;
  sortOrder: number;
};

/** ISO, SRA, and Indian commercial sheet sizes (mm). Printable area notes include typical bleed allowance. */
export const SHEET_SIZES: SheetSeed[] = [
  { code: 'A6', name: 'A6', width: 105, height: 148, sheetType: SheetType.PAPER, description: 'Printable ~99×142 mm (3mm bleed)', sortOrder: 1 },
  { code: 'A5', name: 'A5', width: 148, height: 210, sheetType: SheetType.PAPER, description: 'Printable ~142×204 mm (3mm bleed)', sortOrder: 2 },
  { code: 'A4', name: 'A4', width: 210, height: 297, sheetType: SheetType.PAPER, description: 'Printable ~204×291 mm (3mm bleed)', sortOrder: 3 },
  { code: 'A3', name: 'A3', width: 297, height: 420, sheetType: SheetType.PAPER, description: 'Printable ~291×414 mm (3mm bleed)', sortOrder: 4 },
  { code: 'A2', name: 'A2', width: 420, height: 594, sheetType: SheetType.PAPER, description: 'Printable ~414×588 mm (3mm bleed)', sortOrder: 5 },
  { code: 'A1', name: 'A1', width: 594, height: 841, sheetType: SheetType.PAPER, description: 'Printable ~588×835 mm (3mm bleed)', sortOrder: 6 },
  { code: 'A0', name: 'A0', width: 841, height: 1189, sheetType: SheetType.PAPER, description: 'Printable ~835×1183 mm (3mm bleed)', sortOrder: 7 },
  { code: 'SRA3', name: 'SRA3', width: 320, height: 450, sheetType: SheetType.PAPER, description: 'Printable ~314×444 mm — commercial digital', sortOrder: 8 },
  { code: '12X18', name: '12 × 18 inch', width: 305, height: 457, sheetType: SheetType.PAPER, description: 'Printable ~299×451 mm (3mm bleed)', sortOrder: 9 },
  { code: '13X19', name: '13 × 19 inch', width: 330, height: 483, sheetType: SheetType.PAPER, description: 'Printable ~324×477 mm — wide format digital', sortOrder: 10 },
  { code: '20X30', name: '20 × 30 inch', width: 508, height: 762, sheetType: SheetType.LARGE_FORMAT, description: 'Printable ~502×756 mm', sortOrder: 11 },
  { code: '25X36', name: '25 × 36 inch', width: 635, height: 914, sheetType: SheetType.LARGE_FORMAT, description: 'Printable ~629×908 mm', sortOrder: 12 },
  { code: '28X40', name: '28 × 40 inch', width: 711, height: 1016, sheetType: SheetType.LARGE_FORMAT, description: 'Printable ~705×1010 mm', sortOrder: 13 },
  { code: '30X40', name: '30 × 40 inch', width: 762, height: 1016, sheetType: SheetType.LARGE_FORMAT, description: 'Printable ~756×1010 mm', sortOrder: 14 },
  { code: '4X6FT', name: '4 × 6 ft Flex', width: 1219, height: 1829, sheetType: SheetType.FLEX, description: 'Standard flex banner size', sortOrder: 15 },
  { code: '5X8FT', name: '5 × 8 ft Flex', width: 1524, height: 2438, sheetType: SheetType.FLEX, description: 'Large flex banner', sortOrder: 16 },
  { code: 'CUSTOM_SHEET', name: 'Custom Sheet', width: 100, height: 100, sheetType: SheetType.CUSTOM, description: 'Placeholder — actual size entered at order time', sortOrder: 99 },
];

export async function seedSheetSizes(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('sheet-sizes');
  const mmUnitId = ctx.registry.units.get('MM');
  if (!mmUnitId) throw new Error('MM measurement unit must be seeded first');

  for (const sheet of SHEET_SIZES) {
    const row = await ctx.prisma.sheetSize.upsert({
      where: { code: sheet.code },
      update: {
        name: sheet.name,
        width: sheet.width,
        height: sheet.height,
        measurementUnitId: mmUnitId,
        aspectRatio: sheet.width / sheet.height,
        sheetType: sheet.sheetType,
        description: sheet.description,
        sortOrder: sheet.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: sheet.code,
        name: sheet.name,
        width: sheet.width,
        height: sheet.height,
        measurementUnitId: mmUnitId,
        aspectRatio: sheet.width / sheet.height,
        sheetType: sheet.sheetType,
        description: sheet.description,
        sortOrder: sheet.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.sheetSizes.set(sheet.code, row.id);
  }
  log.info(`Upserted ${SHEET_SIZES.length} sheet sizes`);
}
