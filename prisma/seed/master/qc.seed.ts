import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

interface QcTemplateDef {
  code: string;
  name: string;
  templateCode: string;
  items: Array<{ itemCode: string; label: string; sortOrder: number }>;
}

const QC_TEMPLATES: QcTemplateDef[] = [
  {
    code: 'QC-STANDARD',
    name: 'Standard Production QC',
    templateCode: 'WF-STANDARD-PRODUCTION',
    items: [
      { itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', sortOrder: 1 },
      { itemCode: 'REGISTRATION', label: 'Registration', sortOrder: 2 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 3 },
      { itemCode: 'PACKING_READY', label: 'Packing Readiness', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-DIGITAL',
    name: 'Digital Print QC',
    templateCode: 'WF-DIGITAL',
    items: [
      { itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', sortOrder: 1 },
      { itemCode: 'CUTTING_ACCURACY', label: 'Cutting Accuracy', sortOrder: 2 },
      { itemCode: 'EDGE_QUALITY', label: 'Edge Quality', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-OFFSET',
    name: 'Offset Print QC',
    templateCode: 'WF-OFFSET',
    items: [
      { itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', sortOrder: 1 },
      { itemCode: 'BINDING_QUALITY', label: 'Binding Quality', sortOrder: 2 },
      { itemCode: 'PAGE_ALIGNMENT', label: 'Page Alignment', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-UV',
    name: 'UV Finish QC',
    templateCode: 'WF-UV',
    items: [
      { itemCode: 'UV_COVERAGE', label: 'UV Coverage', sortOrder: 1 },
      { itemCode: 'SURFACE_FINISH', label: 'Surface Finish', sortOrder: 2 },
      { itemCode: 'ADHESION', label: 'Adhesion Test', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-FOILING',
    name: 'Foiling QC',
    templateCode: 'WF-FOILING',
    items: [
      { itemCode: 'FOIL_REGISTRATION', label: 'Foil Registration', sortOrder: 1 },
      { itemCode: 'FOIL_ADHESION', label: 'Foil Adhesion', sortOrder: 2 },
      { itemCode: 'COLOR_ACCURACY', label: 'Base Print Color', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-LAMINATION',
    name: 'Lamination QC',
    templateCode: 'WF-LAMINATION',
    items: [
      { itemCode: 'LAMINATION_BOND', label: 'Lamination Bond', sortOrder: 1 },
      { itemCode: 'BUBBLE_CHECK', label: 'Bubble / Wrinkle Check', sortOrder: 2 },
      { itemCode: 'EDGE_SEAL', label: 'Edge Seal Quality', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-FLEX',
    name: 'Flex Banner QC',
    templateCode: 'WF-FLEX',
    items: [
      { itemCode: 'PRINT_CLARITY', label: 'Print Clarity', sortOrder: 1 },
      { itemCode: 'EYELET_CHECK', label: 'Eyelet / Finishing', sortOrder: 2 },
      { itemCode: 'DIMENSIONS', label: 'Dimension Check', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-LARGE_FORMAT',
    name: 'Large Format QC',
    templateCode: 'WF-LARGE_FORMAT',
    items: [
      { itemCode: 'COLOR_ACCURACY', label: 'Color Accuracy', sortOrder: 1 },
      { itemCode: 'LAMINATION_QUALITY', label: 'Lamination Quality', sortOrder: 2 },
      { itemCode: 'DIMENSIONS', label: 'Dimension Check', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
  {
    code: 'QC-DIE_CUT',
    name: 'Die Cut Packaging QC',
    templateCode: 'WF-DIE_CUT',
    items: [
      { itemCode: 'DIE_ACCURACY', label: 'Die Cut Accuracy', sortOrder: 1 },
      { itemCode: 'CREASE_QUALITY', label: 'Crease Quality', sortOrder: 2 },
      { itemCode: 'PRINT_ALIGNMENT', label: 'Print to Cut Alignment', sortOrder: 3 },
      { itemCode: 'QUANTITY', label: 'Quantity Verification', sortOrder: 4 },
    ],
  },
];

export async function seedQcTemplates(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('qc');
  const { prisma } = ctx;

  let count = 0;
  for (const qc of QC_TEMPLATES) {
    const qcStep = await prisma.workflowTemplateStep.findFirst({
      where: {
        stepCode: 'QUALITY_CHECK',
        workflowTemplate: { code: qc.templateCode },
      },
      select: { id: true },
    });

    if (!qcStep) {
      log.warn(`QC step not found for ${qc.templateCode} — skip ${qc.code}`);
      continue;
    }

    const template = await prisma.qualityChecklistTemplate.upsert({
      where: { code: qc.code },
      update: {
        name: qc.name,
        description: `Quality checklist for ${qc.templateCode}`,
        isActive: true,
        workflowTemplateStepId: qcStep.id,
      },
      create: {
        code: qc.code,
        name: qc.name,
        description: `Quality checklist for ${qc.templateCode}`,
        isActive: true,
        workflowTemplateStepId: qcStep.id,
      },
      select: { id: true },
    });

    for (const item of qc.items) {
      await prisma.qualityChecklistTemplateItem.upsert({
        where: { templateId_itemCode: { templateId: template.id, itemCode: item.itemCode } },
        update: { label: item.label, sortOrder: item.sortOrder, isRequired: true },
        create: {
          templateId: template.id,
          itemCode: item.itemCode,
          label: item.label,
          sortOrder: item.sortOrder,
          isRequired: true,
        },
      });
    }
    count += 1;
  }

  log.info(`Seeded ${count} QC checklist templates`);
}
