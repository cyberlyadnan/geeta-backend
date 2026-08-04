/**
 * Phase 4 setup — makes the CATALOG_DESIGN_APPROVAL flow real and runnable.
 *
 * Creates (idempotently, so it is safe to re-run):
 *   - the Design department
 *   - the three ProductTypeProfile rows
 *   - the wedding-card workflow template, whose two VENDOR_APPROVAL gates are the whole point
 *
 * Run with: npm run seed:wedding-card
 */
import { PrismaClient, WorkflowStatus, WorkflowStepType, ProductSizeMode } from '@prisma/client';
import {
  DESIGN_DEPARTMENT_CODE,
  DESIGN_STEP_CODES,
  WEDDING_CARD_WORKFLOW_CODE,
} from '../src/modules/design-approval/design-approval.constants.js';

const prisma = new PrismaClient();

async function ensureFacility() {
  const existing = await prisma.facility.findFirst({ where: { isActive: true }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.facility.create({
    data: { name: 'Main Facility', code: 'MAIN' },
    select: { id: true },
  });
  return created.id;
}

async function ensureDepartment(facilityId: string, code: string, name: string, sortOrder: number) {
  const existing = await prisma.department.findUnique({ where: { code }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.department.create({
    data: { facilityId, code, name, sortOrder },
    select: { id: true },
  });
  return created.id;
}

async function ensureProfiles() {
  const profiles = [
    {
      key: 'SELF_SERVE_CONFIG',
      name: 'Self-serve configurable product',
      sizeMode: ProductSizeMode.CONFIG,
      pricingStrategyKey: 'quantity_pricing',
      wizardStepsKey: 'SELF_SERVE_WIZARD',
      requiresDesignApproval: false,
    },
    {
      key: 'ROLL_AREA',
      name: 'Roll / flex area-priced product',
      sizeMode: ProductSizeMode.ROLL_BASED,
      pricingStrategyKey: 'flex_area',
      wizardStepsKey: 'SELF_SERVE_WIZARD',
      requiresDesignApproval: false,
    },
    {
      key: 'CATALOG_DESIGN_APPROVAL',
      name: 'Catalog product with design approval',
      sizeMode: ProductSizeMode.FIXED,
      pricingStrategyKey: 'fixed_catalog',
      wizardStepsKey: 'CATALOG_DESIGN_APPROVAL',
      requiresDesignApproval: true,
    },
  ];

  for (const profile of profiles) {
    await prisma.productTypeProfile.upsert({
      where: { key: profile.key },
      create: profile,
      update: {
        name: profile.name,
        sizeMode: profile.sizeMode,
        pricingStrategyKey: profile.pricingStrategyKey,
        wizardStepsKey: profile.wizardStepsKey,
        requiresDesignApproval: profile.requiresDesignApproval,
      },
    });
  }
  console.log(`✔ ${profiles.length} product type profiles`);
}

async function ensureWeddingCardTemplate(facilityId: string, departments: Record<string, string>) {
  const existing = await prisma.workflowTemplate.findUnique({
    where: { code: WEDDING_CARD_WORKFLOW_CODE },
    select: { id: true },
  });
  if (existing) {
    console.log('✔ wedding-card workflow template already exists — left untouched');
    return existing.id;
  }

  const template = await prisma.workflowTemplate.create({
    data: {
      facilityId,
      name: 'Wedding Card — Design Approval',
      code: WEDDING_CARD_WORKFLOW_CODE,
      description:
        'Catalog design flow: design a proof, get customer approval, produce one physical sample, get approval again, then print the full quantity.',
      status: WorkflowStatus.ACTIVE,
    },
    select: { id: true },
  });

  const steps = [
    {
      stepCode: DESIGN_STEP_CODES.DESIGN,
      stepName: 'Design',
      stepType: WorkflowStepType.CUSTOM,
      departmentId: departments.DESIGN!,
      stepOrder: 1,
      expectedMinutes: 240,
      metadata: {},
    },
    {
      stepCode: DESIGN_STEP_CODES.PROOF_APPROVAL,
      stepName: 'Digital proof approval',
      stepType: WorkflowStepType.VENDOR_APPROVAL,
      departmentId: departments.DESIGN!,
      stepOrder: 2,
      expectedMinutes: 60,
      // Changes requested on a digital proof go back to the designer.
      metadata: { reworkTargetStepCode: DESIGN_STEP_CODES.DESIGN },
    },
    {
      stepCode: DESIGN_STEP_CODES.SAMPLE_PRODUCTION,
      stepName: 'Produce physical sample',
      stepType: WorkflowStepType.PRINTING,
      departmentId: departments.PRINTING!,
      stepOrder: 3,
      expectedMinutes: 120,
      metadata: { isSample: true },
    },
    {
      stepCode: DESIGN_STEP_CODES.SAMPLE_APPROVAL,
      stepName: 'Physical sample approval',
      stepType: WorkflowStepType.VENDOR_APPROVAL,
      departmentId: departments.PRINTING!,
      stepOrder: 4,
      expectedMinutes: 1440,
      // OPEN QUESTION FOR THE CLIENT: a rejected physical sample currently goes back to DESIGN,
      // on the assumption the complaint is about how the design came out. If they say it should
      // instead be re-printed without redesigning, change this one value to SAMPLE_PRODUCTION —
      // the engine reads it at runtime, so no code change is needed.
      metadata: { reworkTargetStepCode: DESIGN_STEP_CODES.DESIGN },
    },
    {
      stepCode: DESIGN_STEP_CODES.FULL_PRODUCTION,
      stepName: 'Full quantity production',
      stepType: WorkflowStepType.PRINTING,
      departmentId: departments.PRINTING!,
      stepOrder: 5,
      expectedMinutes: 480,
      locksAmendmentsOnStart: true,
      metadata: {},
    },
  ];

  const created: Record<string, string> = {};
  for (const step of steps) {
    const row = await prisma.workflowTemplateStep.create({
      data: {
        workflowTemplateId: template.id,
        departmentId: step.departmentId,
        stepName: step.stepName,
        stepCode: step.stepCode,
        stepType: step.stepType,
        stepOrder: step.stepOrder,
        expectedMinutes: step.expectedMinutes,
        locksAmendmentsOnStart: step.locksAmendmentsOnStart ?? false,
        metadata: step.metadata,
      },
      select: { id: true },
    });
    created[step.stepCode] = row.id;
  }

  // Strictly sequential: each step waits for the one before it. This is what makes the approval
  // gates actually gate — nothing downstream becomes READY until the vendor closes them.
  const order = [
    DESIGN_STEP_CODES.DESIGN,
    DESIGN_STEP_CODES.PROOF_APPROVAL,
    DESIGN_STEP_CODES.SAMPLE_PRODUCTION,
    DESIGN_STEP_CODES.SAMPLE_APPROVAL,
    DESIGN_STEP_CODES.FULL_PRODUCTION,
  ];
  for (let i = 1; i < order.length; i += 1) {
    await prisma.workflowTemplateStepDependency.create({
      data: {
        workflowTemplateStepId: created[order[i]!]!,
        dependsOnStepId: created[order[i - 1]!]!,
      },
    });
  }

  console.log('✔ wedding-card workflow template with 2 VENDOR_APPROVAL gates');
  return template.id;
}

async function main() {
  const facilityId = await ensureFacility();

  const departments: Record<string, string> = {
    DESIGN: await ensureDepartment(facilityId, DESIGN_DEPARTMENT_CODE, 'Design', 5),
    PRINTING: await ensureDepartment(facilityId, 'PRINTING', 'Printing', 10),
  };
  console.log('✔ departments');

  await ensureProfiles();
  await ensureWeddingCardTemplate(facilityId, departments);

  console.log('\nPhase 4 setup complete.');
  console.log('To make a product use this flow, set its version\'s productTypeProfileId to the');
  console.log('CATALOG_DESIGN_APPROVAL profile and give it a fixedPrice.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
