import { MasterConfigStatus, ValidationLevel } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

export const ARTWORK_RULES = [
  {
    code: 'DIGITAL_ARTWORK',
    name: 'Digital Artwork Profile',
    ruleType: 'FILE_VALIDATION',
    config: {
      allowedExtensions: ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg', 'cdr'],
      maxFileSizeMb: 100,
      minResolution: 300,
      colorMode: 'CMYK_OR_RGB',
      transparencyAllowed: true,
      multiplePages: true,
      rotationAllowed: false,
    },
    failLevel: ValidationLevel.ERROR,
    message: 'Digital artwork must be 300 DPI PDF/AI/PSD with proper bleed',
    sortOrder: 1,
  },
  {
    code: 'OFFSET_ARTWORK',
    name: 'Offset Artwork Profile',
    ruleType: 'FILE_VALIDATION',
    config: {
      allowedExtensions: ['pdf', 'ai', 'eps', 'cdr'],
      maxFileSizeMb: 150,
      minResolution: 300,
      colorMode: 'CMYK',
      transparencyAllowed: false,
      multiplePages: true,
      fontsEmbedded: true,
    },
    failLevel: ValidationLevel.ERROR,
    message: 'Offset requires CMYK PDF/AI with embedded fonts',
    sortOrder: 2,
  },
  {
    code: 'LARGE_FORMAT_ARTWORK',
    name: 'Large Format Artwork Profile',
    ruleType: 'FILE_VALIDATION',
    config: {
      allowedExtensions: ['pdf', 'ai', 'psd', 'png', 'jpg', 'jpeg', 'tiff'],
      maxFileSizeMb: 200,
      minResolution: 72,
      colorMode: 'RGB',
      transparencyAllowed: true,
      multiplePages: false,
    },
    failLevel: ValidationLevel.WARNING,
    message: 'Large format: 72+ DPI RGB acceptable for viewing distance',
    sortOrder: 3,
  },
  {
    code: 'UV_ARTWORK',
    name: 'UV / Special Finish Artwork',
    ruleType: 'FILE_VALIDATION',
    config: {
      allowedExtensions: ['pdf', 'ai', 'psd'],
      maxFileSizeMb: 75,
      minResolution: 300,
      requiresSeparateMaskLayer: true,
      maskColor: '100% K or spot channel',
    },
    failLevel: ValidationLevel.ERROR,
    message: 'UV jobs require separate mask artwork layer',
    sortOrder: 4,
  },
  {
    code: 'PACKAGING_ARTWORK',
    name: 'Packaging Dieline Artwork',
    ruleType: 'FILE_VALIDATION',
    config: {
      allowedExtensions: ['pdf', 'ai', 'cdr'],
      maxFileSizeMb: 150,
      minResolution: 300,
      requiresDielineLayer: true,
      colorMode: 'CMYK',
      spotColorsAllowed: true,
    },
    failLevel: ValidationLevel.ERROR,
    message: 'Packaging requires dieline + artwork layers in PDF/AI',
    sortOrder: 5,
  },
] as const;

export async function seedArtworkRules(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('artwork-rules');
  for (const rule of ARTWORK_RULES) {
    const row = await ctx.prisma.masterArtworkRule.upsert({
      where: { code: rule.code },
      update: {
        name: rule.name,
        ruleType: rule.ruleType,
        config: rule.config,
        failLevel: rule.failLevel,
        message: rule.message,
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
        message: rule.message,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.artworkRules.set(rule.code, row.id);
  }
  log.info(`Upserted ${ARTWORK_RULES.length} artwork rules`);
}

export const ARTWORK_PROFILES = {
  CARD: ['DIGITAL_ARTWORK'],
  DIGITAL_SHEET: ['DIGITAL_ARTWORK'],
  OFFSET: ['OFFSET_ARTWORK'],
  FLEX: ['LARGE_FORMAT_ARTWORK'],
  UV: ['UV_ARTWORK'],
  PACKAGING: ['PACKAGING_ARTWORK'],
} as const;
