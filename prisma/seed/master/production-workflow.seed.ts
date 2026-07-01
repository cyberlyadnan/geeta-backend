import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

const FACILITY_CODE = 'GEETA-MAIN';
const TEMPLATE_CODE = 'WF-STANDARD-PRODUCTION';

const DEPARTMENTS = [
  { code: 'ARTWORK', name: 'Artwork Verification', sortOrder: 1 },
  { code: 'PRINT', name: 'Printing', sortOrder: 2 },
  { code: 'QC', name: 'Quality Control', sortOrder: 3 },
  { code: 'PACKING', name: 'Packing', sortOrder: 4 },
  { code: 'DISPATCH', name: 'Dispatch', sortOrder: 5 },
] as const;

const TEMPLATE_STEPS = [
  {
    departmentCode: 'ARTWORK',
    stepName: 'Artwork Verification',
    stepCode: 'ARTWORK_VERIFICATION',
    stepType: 'VERIFICATION' as const,
    stepOrder: 1,
    expectedMinutes: 30,
  },
  {
    departmentCode: 'PRINT',
    stepName: 'Printing',
    stepCode: 'PRINTING',
    stepType: 'PRINTING' as const,
    stepOrder: 2,
    expectedMinutes: 120,
  },
  {
    departmentCode: 'QC',
    stepName: 'Quality Check',
    stepCode: 'QUALITY_CHECK',
    stepType: 'QUALITY_CHECK' as const,
    stepOrder: 3,
    expectedMinutes: 20,
  },
  {
    departmentCode: 'PACKING',
    stepName: 'Packing',
    stepCode: 'PACKING',
    stepType: 'PACKAGING' as const,
    stepOrder: 4,
    expectedMinutes: 15,
  },
  {
    departmentCode: 'DISPATCH',
    stepName: 'Dispatch',
    stepCode: 'DISPATCH',
    stepType: 'DISPATCH' as const,
    stepOrder: 5,
    expectedMinutes: 10,
  },
];

export async function seedProductionWorkflow(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('production-workflow');
  const { prisma } = ctx;

  log.info('Seeding production facility, departments, and workflow template...');

  const facility = await prisma.facility.upsert({
    where: { code: FACILITY_CODE },
    update: { name: 'Geeta Print Main Facility', isActive: true },
    create: {
      name: 'Geeta Print Main Facility',
      code: FACILITY_CODE,
      address: 'Main Production Unit',
      isActive: true,
    },
  });

  const departmentIds = new Map<string, string>();

  for (const dept of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: {
        name: dept.name,
        sortOrder: dept.sortOrder,
        facilityId: facility.id,
        isActive: true,
      },
      create: {
        facilityId: facility.id,
        name: dept.name,
        code: dept.code,
        sortOrder: dept.sortOrder,
        isActive: true,
      },
    });
    departmentIds.set(dept.code, record.id);
  }

  const template = await prisma.workflowTemplate.upsert({
    where: { code: TEMPLATE_CODE },
    update: {
      name: 'Standard Production Workflow',
      status: 'ACTIVE',
      isDefault: true,
      facilityId: facility.id,
    },
    create: {
      facilityId: facility.id,
      name: 'Standard Production Workflow',
      code: TEMPLATE_CODE,
      description: 'Default end-to-end production workflow for all products',
      status: 'ACTIVE',
      isDefault: true,
    },
  });

  await prisma.workflowTemplate.updateMany({
    where: { id: { not: template.id }, isDefault: true },
    data: { isDefault: false },
  });

  const existingSteps = await prisma.workflowTemplateStep.findMany({
    where: { workflowTemplateId: template.id },
    select: { id: true, stepCode: true },
  });

  const stepIdsByCode = new Map(existingSteps.map((step) => [step.stepCode, step.id]));

  for (const step of TEMPLATE_STEPS) {
    const departmentId = departmentIds.get(step.departmentCode);
    if (!departmentId) continue;

    const existingId = stepIdsByCode.get(step.stepCode);

    if (existingId) {
      await prisma.workflowTemplateStep.update({
        where: { id: existingId },
        data: {
          departmentId,
          stepName: step.stepName,
          stepType: step.stepType,
          stepOrder: step.stepOrder,
          expectedMinutes: step.expectedMinutes,
          isMandatory: true,
        },
      });
    } else {
      const created = await prisma.workflowTemplateStep.create({
        data: {
          workflowTemplateId: template.id,
          departmentId,
          stepName: step.stepName,
          stepCode: step.stepCode,
          stepType: step.stepType,
          stepOrder: step.stepOrder,
          expectedMinutes: step.expectedMinutes,
          isMandatory: true,
        },
      });
      stepIdsByCode.set(step.stepCode, created.id);
    }
  }

  const productVersions = await prisma.productOfferingVersion.findMany({
    where: { isCurrent: true, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });

  for (const version of productVersions) {
    await prisma.productOfferingWorkflow.upsert({
      where: { productOfferingVersionId: version.id },
      update: { workflowTemplateId: template.id },
      create: {
        productOfferingVersionId: version.id,
        workflowTemplateId: template.id,
        isDefault: true,
      },
    });
  }

  log.info(
    `Production workflow seeded: facility=${FACILITY_CODE}, template=${TEMPLATE_CODE}, products=${productVersions.length}`,
  );
}
