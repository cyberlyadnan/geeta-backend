import { FileRequirementType, MasterConfigStatus } from '@prisma/client';
import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

export const FILE_UPLOAD_RULES = [
  { code: 'ARTWORK_MAIN', name: 'Main Artwork — Required', requirementType: FileRequirementType.REQUIRED, maxFileSizeMb: 100, allowMultiple: false, allowedFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG', 'JPEG', 'CDR', 'EPS'], sortOrder: 1 },
  { code: 'ARTWORK_LARGE', name: 'Large Format Artwork', requirementType: FileRequirementType.REQUIRED, maxFileSizeMb: 200, allowMultiple: false, allowedFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG', 'JPEG', 'TIFF'], sortOrder: 2 },
  { code: 'ARTWORK_UV_MASK', name: 'UV / Foil Mask Layer', requirementType: FileRequirementType.REQUIRED, maxFileSizeMb: 75, allowMultiple: false, allowedFileTypes: ['PDF', 'AI', 'PSD'], description: 'Separate spot UV or foil mask file', sortOrder: 3 },
  { code: 'ARTWORK_BACK', name: 'Back Side Artwork', requirementType: FileRequirementType.OPTIONAL, maxFileSizeMb: 100, allowMultiple: false, allowedFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG'], sortOrder: 4 },
  { code: 'ARTWORK_DIELINE', name: 'Packaging Dieline', requirementType: FileRequirementType.REQUIRED, maxFileSizeMb: 150, allowMultiple: true, allowedFileTypes: ['PDF', 'AI', 'CDR'], description: 'Dieline + artwork in layered PDF/AI', sortOrder: 5 },
] as const;

export async function seedFileUploadRules(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('file-upload-rules');
  for (const rule of FILE_UPLOAD_RULES) {
    const row = await ctx.prisma.fileUploadRuleTemplate.upsert({
      where: { code: rule.code },
      update: {
        name: rule.name,
        requirementType: rule.requirementType,
        maxFileSizeMb: rule.maxFileSizeMb,
        allowMultiple: rule.allowMultiple,
        allowedFileTypes: [...rule.allowedFileTypes],
        description: 'description' in rule ? rule.description : undefined,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        code: rule.code,
        name: rule.name,
        requirementType: rule.requirementType,
        maxFileSizeMb: rule.maxFileSizeMb,
        allowMultiple: rule.allowMultiple,
        allowedFileTypes: [...rule.allowedFileTypes],
        description: 'description' in rule ? rule.description : undefined,
        sortOrder: rule.sortOrder,
        status: MasterConfigStatus.ACTIVE,
        createdById: ctx.actorId,
      },
    });
    ctx.registry.fileUploadRules.set(rule.code, row.id);
  }
  log.info(`Upserted ${FILE_UPLOAD_RULES.length} file upload rules`);
}
