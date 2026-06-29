import { MasterConfigStatus } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

/** Industry-standard measurement units for commercial printing ERP */
export const MEASUREMENT_UNITS = [
  { code: 'MM', name: 'Millimeter', symbol: 'mm', toMmFactor: 1, sortOrder: 1 },
  { code: 'CM', name: 'Centimeter', symbol: 'cm', toMmFactor: 10, sortOrder: 2 },
  { code: 'M', name: 'Meter', symbol: 'm', toMmFactor: 1000, sortOrder: 3 },
  { code: 'INCH', name: 'Inch', symbol: 'in', toMmFactor: 25.4, sortOrder: 4 },
  { code: 'FT', name: 'Feet', symbol: 'ft', toMmFactor: 304.8, sortOrder: 5 },
  { code: 'SQFT', name: 'Square Feet', symbol: 'sq ft', toMmFactor: 1, sortOrder: 6 },
  { code: 'SQM', name: 'Square Meter', symbol: 'sq m', toMmFactor: 1, sortOrder: 7 },
  { code: 'PX', name: 'Pixel', symbol: 'px', toMmFactor: 0.264583, sortOrder: 8 },
  { code: 'PCT', name: 'Percentage', symbol: '%', toMmFactor: 1, sortOrder: 9 },
  { code: 'SHEET', name: 'Sheet', symbol: 'sheet', toMmFactor: 1, sortOrder: 10 },
  { code: 'ROLL', name: 'Roll', symbol: 'roll', toMmFactor: 1, sortOrder: 11 },
  { code: 'PCS', name: 'Pieces', symbol: 'pcs', toMmFactor: 1, sortOrder: 12 },
] as const;

export async function seedMeasurementUnits(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('measurement-units');
  for (const unit of MEASUREMENT_UNITS) {
    const row = await ctx.prisma.measurementUnit.upsert({
      where: { code: unit.code },
      update: {
        name: unit.name,
        symbol: unit.symbol,
        toMmFactor: unit.toMmFactor,
        sortOrder: unit.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: { ...unit, status: MasterConfigStatus.ACTIVE },
    });
    ctx.registry.units.set(unit.code, row.id);
  }
  log.info(`Upserted ${MEASUREMENT_UNITS.length} measurement units`);
}
