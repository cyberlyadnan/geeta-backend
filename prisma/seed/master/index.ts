import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { seedMeasurementUnits } from './measurement-units.seed.js';
import { seedSheetSizes } from './sheet-sizes.seed.js';
import { seedSizeTemplates } from './size-templates.seed.js';
import { seedPrintSpecifications } from './print-specifications.seed.js';
import { seedPrintProcesses } from './print-processes.seed.js';
import { seedValidationRules } from './validation-rules.seed.js';
import { seedArtworkRules } from './artwork-rules.seed.js';
import { seedCoverageRules } from './coverage-rules.seed.js';
import { seedFileUploadRules } from './file-upload-rules.seed.js';
import { seedCategories } from './categories.seed.js';
import { seedDeliverySettings } from './delivery-settings.seed.js';
import { seedPlatformSettings } from './settings.seed.js';
import { seedProductionWorkflow } from './production-workflow.seed.js';
import { seedProductionQcChecklist } from './production-qc-checklist.seed.js';
import { seedProductionStaff } from './production-staff.seed.js';
import { PRICING_STRATEGIES } from './pricing-strategies.seed.js';

export async function seedMasterData(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('master');
  log.info('Starting production master data seed...');

  await seedMeasurementUnits(ctx);
  await seedSheetSizes(ctx);
  await seedSizeTemplates(ctx);
  await seedPrintSpecifications(ctx);
  await seedValidationRules(ctx);
  await seedArtworkRules(ctx);
  await seedCoverageRules(ctx);
  await seedFileUploadRules(ctx);
  await seedPrintProcesses(ctx);
  await seedCategories(ctx);
  await seedDeliverySettings(ctx);
  await seedPlatformSettings(ctx);
  await seedProductionWorkflow(ctx);
  await seedProductionQcChecklist(ctx);
  await seedProductionStaff(ctx);

  log.info(`Registered ${PRICING_STRATEGIES.length} pricing strategy keys (catalog)`);
  log.info('Production master data seed complete');
}

export {
  seedMeasurementUnits,
  seedSheetSizes,
  seedSizeTemplates,
  seedPrintProcesses,
  seedPrintSpecifications,
  seedValidationRules,
  seedArtworkRules,
  seedCoverageRules,
  seedFileUploadRules,
  seedCategories,
  seedDeliverySettings,
  seedPlatformSettings,
  seedProductionWorkflow,
  seedProductionStaff,
};
