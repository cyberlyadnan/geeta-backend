import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

const TEMPLATE_CODE = 'WF-STANDARD-PRODUCTION';
const QC_STEP_CODE = 'QUALITY_CHECK';
const DEFAULT_QC_CHECKLIST_CODE = 'QC-STANDARD-CHECKLIST';

const DEFAULT_QC_CHECKLIST_ITEMS = [
  { itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', sortOrder: 1 },
  { itemCode: 'REGISTRATION', label: 'Registration', sortOrder: 2 },
  { itemCode: 'ALIGNMENT', label: 'Alignment', sortOrder: 3 },
  { itemCode: 'BLEEDING', label: 'Bleeding', sortOrder: 4 },
  { itemCode: 'SAFE_AREA', label: 'Safe Area', sortOrder: 5 },
  { itemCode: 'CUTTING_ACCURACY', label: 'Cutting Accuracy', sortOrder: 6 },
  { itemCode: 'LAMINATION_QUALITY', label: 'Lamination Quality', sortOrder: 7 },
  { itemCode: 'FOILING_QUALITY', label: 'Foiling Quality', sortOrder: 8 },
  { itemCode: 'UV_QUALITY', label: 'UV Quality', sortOrder: 9 },
  { itemCode: 'QUANTITY_VERIFICATION', label: 'Quantity Verification', sortOrder: 10 },
  { itemCode: 'PACKING_READINESS', label: 'Packing Readiness', sortOrder: 11 },
] as const;

export async function seedProductionQcChecklist(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('production-qc-checklist');
  const { prisma } = ctx;

  const qcStep = await prisma.workflowTemplateStep.findFirst({
    where: {
      stepCode: QC_STEP_CODE,
      workflowTemplate: { code: TEMPLATE_CODE },
    },
    select: { id: true },
  });

  if (!qcStep) {
    log.warn('QC workflow step not found — skipping checklist seed');
    return;
  }

  const template = await prisma.qualityChecklistTemplate.upsert({
    where: { code: DEFAULT_QC_CHECKLIST_CODE },
    update: {
      name: 'Standard QC Checklist',
      description: 'Default quality inspection checklist for production workflows',
      isActive: true,
      workflowTemplateStepId: qcStep.id,
    },
    create: {
      code: DEFAULT_QC_CHECKLIST_CODE,
      name: 'Standard QC Checklist',
      description: 'Default quality inspection checklist for production workflows',
      isActive: true,
      workflowTemplateStepId: qcStep.id,
    },
    select: { id: true },
  });

  for (const item of DEFAULT_QC_CHECKLIST_ITEMS) {
    await prisma.qualityChecklistTemplateItem.upsert({
      where: {
        templateId_itemCode: { templateId: template.id, itemCode: item.itemCode },
      },
      update: {
        label: item.label,
        sortOrder: item.sortOrder,
        isRequired: true,
      },
      create: {
        templateId: template.id,
        itemCode: item.itemCode,
        label: item.label,
        sortOrder: item.sortOrder,
        isRequired: true,
      },
    });
  }

  log.info(`QC checklist template seeded: ${DEFAULT_QC_CHECKLIST_CODE} (${DEFAULT_QC_CHECKLIST_ITEMS.length} items)`);
}
