import { MasterConfigStatus } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

export const PRINT_PROCESSES = [
  { code: 'DIGITAL', name: 'Digital Printing', pricingStrategyKey: 'digital_standard', description: 'Toner / inkjet sheet-fed digital production' },
  { code: 'OFFSET', name: 'Offset Printing', pricingStrategyKey: 'offset_standard', description: 'Commercial offset lithography' },
  { code: 'LARGE_FORMAT', name: 'Large Format Printing', pricingStrategyKey: 'per_sqft', description: 'Wide-format inkjet — posters, displays' },
  { code: 'FLEX', name: 'Flex Printing', pricingStrategyKey: 'flex_area', description: 'Frontlit / backlit flex banners' },
  { code: 'VINYL', name: 'Vinyl Printing', pricingStrategyKey: 'vinyl_area', description: 'Self-adhesive vinyl, vehicle graphics' },
  { code: 'CANVAS', name: 'Canvas Printing', pricingStrategyKey: 'canvas_area', description: 'Canvas wraps and gallery prints' },
  { code: 'ACP', name: 'ACP Printing', pricingStrategyKey: 'board_area', description: 'Aluminium composite panel UV print' },
  { code: 'SUNBOARD', name: 'Sunboard Printing', pricingStrategyKey: 'board_area', description: 'Foam board / sunboard direct print' },
  { code: 'SPOT_UV', name: 'Spot UV', pricingStrategyKey: 'spot_uv_coverage', description: 'Selective UV varnish' },
  { code: 'RAISED_UV', name: 'Raised UV', pricingStrategyKey: 'raised_uv_coverage', description: 'Thick raised UV texture' },
  { code: 'FOILING', name: 'Foiling', pricingStrategyKey: 'foil_coverage', description: 'Hot foil stamping' },
  { code: 'EMBOSSING', name: 'Embossing', pricingStrategyKey: 'emboss', description: 'Blind emboss / raised impression' },
  { code: 'DEBOSSING', name: 'Debossing', pricingStrategyKey: 'deboss', description: 'Debossed impression' },
  { code: 'LAMINATION', name: 'Lamination', pricingStrategyKey: 'per_sheet', description: 'Matt / gloss lamination as finishing step' },
  { code: 'BINDING', name: 'Binding', pricingStrategyKey: 'binding', description: 'Perfect bind, saddle stitch, wiro' },
  { code: 'LASER_CUT', name: 'Laser Cutting', pricingStrategyKey: 'laser_cut', description: 'Laser cut shapes and stencils' },
  { code: 'DIE_CUT', name: 'Die Cutting', pricingStrategyKey: 'die_cut', description: 'Custom die cut shapes' },
  { code: 'PACKAGING', name: 'Packaging', pricingStrategyKey: 'packaging_unit', description: 'Folding cartons, bags, rigid boxes' },
  { code: 'SCREEN', name: 'Screen Printing', pricingStrategyKey: 'screen_standard', description: 'Silk screen — textiles, bottles' },
  { code: 'WHITE_INK', name: 'White Ink', pricingStrategyKey: 'white_ink', description: 'White ink base layer on dark media' },
] as const;

const DEFAULT_STRATEGIES = ['FIXED_SIZE', 'SHEET_BASED', 'AREA_BASED', 'CUSTOM_SIZE', 'ROLL_BASED', 'COVERAGE_BASED'];
const DEFAULT_FILE_TYPES = ['PDF', 'AI', 'PSD', 'PNG', 'JPG', 'JPEG', 'CDR', 'EPS', 'TIFF'];
const DEFAULT_VALIDATION = ['DIMENSION', 'RESOLUTION', 'BLEED', 'SAFE_AREA', 'PAGE_COUNT', 'COLOR_MODE'];

export async function seedPrintProcesses(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('print-processes');

  for (const [idx, process] of PRINT_PROCESSES.entries()) {
    const defaultTemplate =
      process.code === 'FLEX' || process.code === 'VINYL' || process.code === 'LARGE_FORMAT'
        ? ctx.registry.sizeTemplates.get('FLEX_CUSTOM')
        : process.code === 'CANVAS'
          ? ctx.registry.sizeTemplates.get('CANVAS_CUSTOM')
          : process.code.includes('UV') || process.code === 'FOILING'
            ? ctx.registry.sizeTemplates.get('VISITING_CARD_FIXED')
            : ctx.registry.sizeTemplates.get('DIGITAL_SHEET_SIZES');

    const row = await ctx.prisma.printProcess.upsert({
      where: { code: process.code },
      update: {
        name: process.name,
        description: process.description,
        pricingStrategyKey: process.pricingStrategyKey,
        defaultSizeTemplateId: defaultTemplate ?? null,
        supportedFileTypes: DEFAULT_FILE_TYPES,
        supportedSizeStrategies: DEFAULT_STRATEGIES,
        supportedValidationTypes: DEFAULT_VALIDATION,
        sortOrder: idx + 1,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: process.code,
        name: process.name,
        description: process.description,
        pricingStrategyKey: process.pricingStrategyKey,
        defaultSizeTemplateId: defaultTemplate ?? null,
        supportedFileTypes: DEFAULT_FILE_TYPES,
        supportedSizeStrategies: DEFAULT_STRATEGIES,
        supportedValidationTypes: DEFAULT_VALIDATION,
        sortOrder: idx + 1,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.printProcesses.set(process.code, row.id);
  }
  log.info(`Upserted ${PRINT_PROCESSES.length} print processes`);
}
