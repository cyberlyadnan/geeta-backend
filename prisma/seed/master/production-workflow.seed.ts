import type { SeedContext } from '../core/types.js';
import { seedDepartments } from './departments.seed.js';
import { seedWorkflowTemplates } from './workflow-templates.seed.js';

/** @deprecated Use seedDepartments + seedWorkflowTemplates */
export async function seedProductionWorkflow(ctx: SeedContext): Promise<void> {
  await seedDepartments(ctx);
  await seedWorkflowTemplates(ctx);
}
