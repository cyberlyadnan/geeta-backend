import { MasterConfigStatus } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

export const COVERAGE_RULES = [
  { code: 'SPOT_UV_STD', name: 'Spot UV — Standard', coverageType: 'SPOT_UV', pricePerCm2: 2.5, minCharge: 50, maxCharge: 5000, supportedFileTypes: ['PDF', 'AI', 'PSD'], sortOrder: 1 },
  { code: 'RAISED_UV_STD', name: 'Raised UV — Standard', coverageType: 'RAISED_UV', pricePerCm2: 4.0, minCharge: 100, maxCharge: 8000, supportedFileTypes: ['PDF', 'AI'], sortOrder: 2 },
  { code: 'WHITE_INK_STD', name: 'White Ink Underprint', coverageType: 'WHITE_INK', pricePerCm2: 1.8, minCharge: 40, maxCharge: 3000, supportedFileTypes: ['PDF', 'AI', 'PSD'], sortOrder: 3 },
  { code: 'FOIL_GOLD', name: 'Gold Foiling', coverageType: 'FOIL', pricePerCm2: 5.0, minCharge: 150, maxCharge: 10000, supportedFileTypes: ['PDF', 'AI'], sortOrder: 4 },
  { code: 'FOIL_SILVER', name: 'Silver Foiling', coverageType: 'FOIL', pricePerCm2: 4.5, minCharge: 150, maxCharge: 10000, supportedFileTypes: ['PDF', 'AI'], sortOrder: 5 },
  { code: 'TRANSPARENT_INK', name: 'Transparent Ink / Varnish', coverageType: 'TRANSPARENT_INK', pricePerCm2: 1.5, minCharge: 30, maxCharge: 2000, supportedFileTypes: ['PDF', 'AI'], sortOrder: 6 },
  { code: 'VARNISH_MATT', name: 'Matt Varnish', coverageType: 'VARNISH', pricePerCm2: 1.2, minCharge: 25, maxCharge: 1500, supportedFileTypes: ['PDF', 'AI'], sortOrder: 7 },
  { code: 'EMBOSS_STD', name: 'Embossing Area', coverageType: 'EMBOSS', pricePerCm2: 6.0, minCharge: 200, maxCharge: 12000, supportedFileTypes: ['PDF', 'AI'], sortOrder: 8 },
] as const;

export async function seedCoverageRules(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('coverage-rules');
  for (const rule of COVERAGE_RULES) {
    const row = await ctx.prisma.masterCoverageRule.upsert({
      where: { code: rule.code },
      update: {
        name: rule.name,
        coverageType: rule.coverageType,
        pricePerCm2: rule.pricePerCm2,
        minCharge: rule.minCharge,
        maxCharge: rule.maxCharge,
        supportedFileTypes: rule.supportedFileTypes,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: rule.code,
        name: rule.name,
        coverageType: rule.coverageType,
        pricePerCm2: rule.pricePerCm2,
        minCharge: rule.minCharge,
        maxCharge: rule.maxCharge,
        supportedFileTypes: rule.supportedFileTypes,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.coverageRules.set(rule.code, row.id);
  }
  log.info(`Upserted ${COVERAGE_RULES.length} coverage rules`);
}
