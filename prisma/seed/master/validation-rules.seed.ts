import { MasterConfigStatus, ValidationLevel } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

export const VALIDATION_RULES = [
  { code: 'MIN_DPI_300', name: 'Minimum DPI 300', ruleType: 'RESOLUTION', config: { minDpi: 300 }, failLevel: ValidationLevel.ERROR, warningThreshold: 250, errorThreshold: 200, sortOrder: 1 },
  { code: 'MIN_DPI_150', name: 'Minimum DPI 150', ruleType: 'RESOLUTION', config: { minDpi: 150 }, failLevel: ValidationLevel.WARNING, warningThreshold: 120, errorThreshold: 72, sortOrder: 2 },
  { code: 'MIN_DPI_72', name: 'Minimum DPI 72 (Large Format)', ruleType: 'RESOLUTION', config: { minDpi: 72 }, failLevel: ValidationLevel.WARNING, warningThreshold: 60, errorThreshold: 50, sortOrder: 3 },
  { code: 'MAX_FILE_50MB', name: 'Maximum File 50 MB', ruleType: 'FILE_SIZE', config: { maxFileSizeMb: 50 }, failLevel: ValidationLevel.ERROR, sortOrder: 4 },
  { code: 'MAX_FILE_100MB', name: 'Maximum File 100 MB', ruleType: 'FILE_SIZE', config: { maxFileSizeMb: 100 }, failLevel: ValidationLevel.ERROR, sortOrder: 5 },
  { code: 'MAX_FILE_200MB', name: 'Maximum File 200 MB', ruleType: 'FILE_SIZE', config: { maxFileSizeMb: 200 }, failLevel: ValidationLevel.ERROR, sortOrder: 6 },
  { code: 'ALLOWED_EXTENSIONS_STD', name: 'Allowed Extensions — Standard', ruleType: 'FILE_TYPE', config: { allowedExtensions: ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg', 'cdr', 'eps'] }, failLevel: ValidationLevel.ERROR, sortOrder: 7 },
  { code: 'DIMENSION_TOLERANCE_1MM', name: 'Dimension Tolerance ±1 mm', ruleType: 'DIMENSION', config: { toleranceMm: 1 }, failLevel: ValidationLevel.ERROR, sortOrder: 8 },
  { code: 'DIMENSION_TOLERANCE_3MM', name: 'Dimension Tolerance ±3 mm (Flex)', ruleType: 'DIMENSION', config: { toleranceMm: 3 }, failLevel: ValidationLevel.WARNING, sortOrder: 9 },
  { code: 'BLEED_REQUIRED_2MM', name: 'Bleed Required 2 mm', ruleType: 'BLEED', config: { requiredBleedMm: 2 }, failLevel: ValidationLevel.ERROR, sortOrder: 10 },
  { code: 'BLEED_REQUIRED_3MM', name: 'Bleed Required 3 mm', ruleType: 'BLEED', config: { requiredBleedMm: 3 }, failLevel: ValidationLevel.ERROR, sortOrder: 11 },
  { code: 'SAFE_AREA_3MM', name: 'Safe Area 3 mm', ruleType: 'SAFE_AREA', config: { safeAreaMm: 3 }, failLevel: ValidationLevel.WARNING, sortOrder: 12 },
  { code: 'COLOR_MODE_CMYK', name: 'Color Mode CMYK Required', ruleType: 'COLOR_MODE', config: { requiredColorMode: 'CMYK' }, failLevel: ValidationLevel.WARNING, sortOrder: 13 },
  { code: 'PAGE_COUNT_EXACT', name: 'Page Count Validation', ruleType: 'PAGE_COUNT', config: { allowMultiplePages: true }, failLevel: ValidationLevel.ERROR, sortOrder: 14 },
  { code: 'MIN_SIZE_FLEX', name: 'Minimum Flex Size 12×12 inch', ruleType: 'MIN_SIZE', config: { minWidthMm: 305, minHeightMm: 305 }, failLevel: ValidationLevel.ERROR, sortOrder: 15 },
  { code: 'MAX_SIZE_FLEX', name: 'Maximum Flex Size 16×50 ft', ruleType: 'MAX_SIZE', config: { maxWidthMm: 4877, maxHeightMm: 15240 }, failLevel: ValidationLevel.ERROR, sortOrder: 16 },
] as const;

export async function seedValidationRules(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('validation-rules');
  for (const rule of VALIDATION_RULES) {
    const row = await ctx.prisma.masterValidationRule.upsert({
      where: { code: rule.code },
      update: {
        name: rule.name,
        ruleType: rule.ruleType,
        config: rule.config,
        failLevel: rule.failLevel,
        warningThreshold: 'warningThreshold' in rule ? rule.warningThreshold : undefined,
        errorThreshold: 'errorThreshold' in rule ? rule.errorThreshold : undefined,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: rule.code,
        name: rule.name,
        ruleType: rule.ruleType,
        config: rule.config,
        failLevel: rule.failLevel,
        warningThreshold: 'warningThreshold' in rule ? rule.warningThreshold : undefined,
        errorThreshold: 'errorThreshold' in rule ? rule.errorThreshold : undefined,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.validationRules.set(rule.code, row.id);
  }
  log.info(`Upserted ${VALIDATION_RULES.length} validation rules`);
}

/** Preset rule sets for print profiles */
export const VALIDATION_PROFILES = {
  CARD_STD: ['MIN_DPI_300', 'MAX_FILE_50MB', 'ALLOWED_EXTENSIONS_STD', 'DIMENSION_TOLERANCE_1MM', 'BLEED_REQUIRED_2MM', 'SAFE_AREA_3MM', 'COLOR_MODE_CMYK'],
  DIGITAL_SHEET: ['MIN_DPI_300', 'MAX_FILE_100MB', 'ALLOWED_EXTENSIONS_STD', 'BLEED_REQUIRED_3MM', 'SAFE_AREA_3MM', 'PAGE_COUNT_EXACT'],
  FLEX: ['MIN_DPI_72', 'MAX_FILE_200MB', 'ALLOWED_EXTENSIONS_STD', 'DIMENSION_TOLERANCE_3MM', 'MIN_SIZE_FLEX', 'MAX_SIZE_FLEX'],
  UV_COVERAGE: ['MIN_DPI_300', 'MAX_FILE_50MB', 'ALLOWED_EXTENSIONS_STD', 'DIMENSION_TOLERANCE_1MM', 'BLEED_REQUIRED_2MM'],
  LABEL: ['MIN_DPI_300', 'MAX_FILE_50MB', 'ALLOWED_EXTENSIONS_STD'],
} as const;
