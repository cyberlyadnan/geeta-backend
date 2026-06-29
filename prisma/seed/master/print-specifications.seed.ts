import { MasterConfigStatus, PrintColorMode } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

const FORMATS_STD = ['PDF', 'AI', 'PSD', 'PNG', 'JPG', 'JPEG', 'CDR', 'EPS'];
const FORMATS_LARGE = ['PDF', 'AI', 'PSD', 'PNG', 'JPG', 'JPEG', 'TIFF'];

export const PRINT_SPECIFICATIONS = [
  {
    code: 'VISITING_CARD_STD',
    name: 'Visiting Card — Standard 300 DPI',
    finishedWidthMm: 90, finishedHeightMm: 54, artworkWidthMm: 94, artworkHeightMm: 58,
    bleedMm: 2, safeAreaMm: 3, minDpi: 300, maxFileSizeMb: 50, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_STD, sortOrder: 1,
  },
  {
    code: 'VISITING_CARD_PREMIUM',
    name: 'Visiting Card — Premium 350 DPI',
    finishedWidthMm: 90, finishedHeightMm: 54, artworkWidthMm: 96, artworkHeightMm: 60,
    bleedMm: 3, safeAreaMm: 4, minDpi: 350, maxFileSizeMb: 75, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_STD, sortOrder: 2,
  },
  {
    code: 'DIGITAL_SHEET_STD',
    name: 'Digital Sheet — Standard',
    finishedWidthMm: 210, finishedHeightMm: 297, artworkWidthMm: 216, artworkHeightMm: 303,
    bleedMm: 3, safeAreaMm: 5, minDpi: 300, maxFileSizeMb: 100, colorMode: PrintColorMode.ANY,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_STD, sortOrder: 3,
  },
  {
    code: 'OFFSET_SHEET_STD',
    name: 'Offset Sheet — Commercial',
    finishedWidthMm: 210, finishedHeightMm: 297, artworkWidthMm: 216, artworkHeightMm: 303,
    bleedMm: 3, safeAreaMm: 5, minDpi: 300, maxFileSizeMb: 150, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_STD, sortOrder: 4,
  },
  {
    code: 'FLEX_LARGE_FORMAT',
    name: 'Flex — Large Format 72 DPI',
    minDpi: 72, maxFileSizeMb: 200, colorMode: PrintColorMode.RGB,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    bleedMm: 0, safeAreaMm: 0,
    allowedFormats: FORMATS_LARGE, sortOrder: 5,
  },
  {
    code: 'VINYL_VEHICLE',
    name: 'Vinyl — Vehicle Graphics 150 DPI',
    minDpi: 150, maxFileSizeMb: 250, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_LARGE, sortOrder: 6,
  },
  {
    code: 'CANVAS_GALLERY',
    name: 'Canvas — Gallery Print 150 DPI',
    minDpi: 150, maxFileSizeMb: 200, colorMode: PrintColorMode.RGB,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_LARGE, sortOrder: 7,
  },
  {
    code: 'BOARD_ACP_SUNBOARD',
    name: 'ACP / Sunboard — UV Direct 100 DPI',
    minDpi: 100, maxFileSizeMb: 300, colorMode: PrintColorMode.RGB,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: FORMATS_LARGE, sortOrder: 8,
  },
  {
    code: 'SPOT_UV_CARD',
    name: 'Spot UV Card — 300 DPI + Coverage',
    finishedWidthMm: 90, finishedHeightMm: 54, artworkWidthMm: 94, artworkHeightMm: 58,
    bleedMm: 2, safeAreaMm: 3, minDpi: 300, maxFileSizeMb: 75, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: true,
    allowedFormats: FORMATS_STD, sortOrder: 9,
  },
  {
    code: 'PACKAGING_DIELINE',
    name: 'Packaging — Dieline 300 DPI',
    minDpi: 300, maxFileSizeMb: 150, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    bleedMm: 3, safeAreaMm: 5,
    allowedFormats: FORMATS_STD, sortOrder: 10,
  },
  {
    code: 'LABEL_ROLL',
    name: 'Label Roll — 300 DPI',
    minDpi: 300, maxFileSizeMb: 50, colorMode: PrintColorMode.CMYK,
    validationEnabled: true, previewEnabled: true, coverageAnalysisEnabled: false,
    allowedFormats: ['PDF', 'AI', 'PNG'], sortOrder: 11,
  },
] as const;

export async function seedPrintSpecifications(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('print-specifications');
  for (const spec of PRINT_SPECIFICATIONS) {
    const row = await ctx.prisma.printSpecificationTemplate.upsert({
      where: { code: spec.code },
      update: {
        name: spec.name,
        finishedWidthMm: 'finishedWidthMm' in spec ? spec.finishedWidthMm : undefined,
        finishedHeightMm: 'finishedHeightMm' in spec ? spec.finishedHeightMm : undefined,
        artworkWidthMm: 'artworkWidthMm' in spec ? spec.artworkWidthMm : undefined,
        artworkHeightMm: 'artworkHeightMm' in spec ? spec.artworkHeightMm : undefined,
        bleedMm: spec.bleedMm ?? undefined,
        safeAreaMm: spec.safeAreaMm ?? undefined,
        minDpi: spec.minDpi,
        maxFileSizeMb: spec.maxFileSizeMb,
        colorMode: spec.colorMode,
        validationEnabled: spec.validationEnabled,
        previewEnabled: spec.previewEnabled,
        coverageAnalysisEnabled: spec.coverageAnalysisEnabled,
        allowedFormats: [...spec.allowedFormats],
        sortOrder: spec.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: spec.code,
        name: spec.name,
        finishedWidthMm: 'finishedWidthMm' in spec ? spec.finishedWidthMm : undefined,
        finishedHeightMm: 'finishedHeightMm' in spec ? spec.finishedHeightMm : undefined,
        artworkWidthMm: 'artworkWidthMm' in spec ? spec.artworkWidthMm : undefined,
        artworkHeightMm: 'artworkHeightMm' in spec ? spec.artworkHeightMm : undefined,
        bleedMm: spec.bleedMm ?? undefined,
        safeAreaMm: spec.safeAreaMm ?? undefined,
        minDpi: spec.minDpi,
        maxFileSizeMb: spec.maxFileSizeMb,
        colorMode: spec.colorMode,
        validationEnabled: spec.validationEnabled,
        previewEnabled: spec.previewEnabled,
        coverageAnalysisEnabled: spec.coverageAnalysisEnabled,
        allowedFormats: [...spec.allowedFormats],
        sortOrder: spec.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.printSpecifications.set(spec.code, row.id);
  }
  log.info(`Upserted ${PRINT_SPECIFICATIONS.length} print specifications`);
}
