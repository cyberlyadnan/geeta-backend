import type { SeedContext } from './types.js';

/** Load master code→id maps from DB (required when running products seed in isolation). */
export async function hydrateRegistryFromDatabase(ctx: SeedContext): Promise<void> {
  const { registry, prisma } = ctx;

  const [
    units,
    sheetSizes,
    sizeTemplates,
    printProcesses,
    printSpecs,
    artworkRules,
    validationRules,
    coverageRules,
    fileUploadRules,
    categories,
    families,
    series,
  ] = await Promise.all([
    prisma.measurementUnit.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.sheetSize.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.sizeTemplate.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.printProcess.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.printSpecificationTemplate.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.masterArtworkRule.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.masterValidationRule.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.masterCoverageRule.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.fileUploadRuleTemplate.findMany({ where: { deletedAt: null }, select: { id: true, code: true } }),
    prisma.category.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } }),
    prisma.productFamily.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } }),
    prisma.productSeries.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } }),
  ]);

  for (const row of units) registry.units.set(row.code, row.id);
  for (const row of sheetSizes) registry.sheetSizes.set(row.code, row.id);
  for (const row of sizeTemplates) registry.sizeTemplates.set(row.code, row.id);
  for (const row of printProcesses) registry.printProcesses.set(row.code, row.id);
  for (const row of printSpecs) registry.printSpecifications.set(row.code, row.id);
  for (const row of artworkRules) registry.artworkRules.set(row.code, row.id);
  for (const row of validationRules) registry.validationRules.set(row.code, row.id);
  for (const row of coverageRules) registry.coverageRules.set(row.code, row.id);
  for (const row of fileUploadRules) registry.fileUploadRules.set(row.code, row.id);
  for (const row of categories) registry.categories.set(row.slug, row.id);
  for (const row of families) registry.families.set(row.slug, row.id);
  for (const row of series) registry.series.set(row.slug, row.id);
}
