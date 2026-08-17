/**
 * Phase 4 setup — makes the CATALOG_DESIGN_APPROVAL flow real and runnable.
 *
 * Creates (idempotently, so it is safe to re-run):
 *   - the Design department
 *   - the three ProductTypeProfile rows
 *   - the wedding-card workflow template, whose two VENDOR_APPROVAL gates are the whole point
 *   - a first sellable Wedding Cards product (Category -> Family -> Series -> Offering ->
 *     Version), bound to that template, so the catalog gallery has something real to show
 *
 * Run with: npm run seed:wedding-card
 */
import {
  PrismaClient,
  WorkflowStatus,
  WorkflowStepType,
  ProductSizeMode,
  ProductStatus,
  ProductVisibility,
  ProductOfferingVersionStatus,
  ConfigurationFieldType,
} from '@prisma/client';
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

/**
 * The example spec sheet the client walked through: MOQ 50, order code 1201, 6x8, both-side
 * cover, single-side 2-leaf inner, velvet lamination, die cut, poly pack, address sticker
 * included, ₹38+, GST 18% extra. Modeled as plain ConfigurationField/Option rows — the same
 * dynamic attribute system every other product uses — so a future Birthday/Anniversary card
 * needs only a new row set here (or via the admin catalog UI), never a code change.
 */
async function ensureWeddingCardProduct(workflowTemplateId: string): Promise<void> {
  const category = await prisma.category.upsert({
    where: { slug: 'wedding-cards' },
    update: {},
    create: {
      name: 'Wedding Cards',
      slug: 'wedding-cards',
      description: 'Invitation cards for weddings and other celebrations.',
      sortOrder: 20,
    },
    select: { id: true },
  });

  const family = await prisma.productFamily.upsert({
    where: { slug: 'wedding-cards-classic' },
    update: {},
    create: {
      categoryId: category.id,
      name: 'Classic Collection',
      slug: 'wedding-cards-classic',
      description: 'Ready-made wedding card designs, ordered by picking a design rather than configuring options.',
      status: ProductStatus.ACTIVE,
    },
    select: { id: true },
  });

  const series = await prisma.productSeries.upsert({
    where: { slug: 'wedding-cards-classic-velvet' },
    update: {},
    create: {
      familyId: family.id,
      name: 'Velvet Laminated',
      slug: 'wedding-cards-classic-velvet',
      status: ProductStatus.ACTIVE,
    },
    select: { id: true },
  });

  const catalogProfile = await prisma.productTypeProfile.findUniqueOrThrow({
    where: { key: 'CATALOG_DESIGN_APPROVAL' },
    select: { id: true },
  });

  const offering = await prisma.productOffering.upsert({
    where: { slug: 'wedding-card-1201' },
    update: {},
    create: {
      seriesId: series.id,
      name: 'Wedding Invitation Card — 1201',
      slug: 'wedding-card-1201',
      displayName: 'Royal Velvet Wedding Card',
      shortDescription: 'Velvet-laminated wedding invitation with a die-cut edge and matching address sticker.',
      description:
        'A classic wedding invitation printed both sides on the cover with a single-side, ' +
        '2-leaf inner insert. Finished with velvet lamination and a precise die cut, and ' +
        'comes with a matching address sticker for the envelope.',
      sku: '1201',
      visibility: ProductVisibility.PUBLIC,
      status: ProductStatus.ACTIVE,
      isFeatured: true,
    },
    select: { id: true },
  });

  const existingVersion = await prisma.productOfferingVersion.findFirst({
    where: { productOfferingId: offering.id, isCurrent: true },
    select: { id: true },
  });
  if (existingVersion) {
    console.log('✔ wedding card product already has a current version — left untouched');
    return;
  }

  const version = await prisma.productOfferingVersion.create({
    data: {
      productOfferingId: offering.id,
      versionNumber: 1,
      versionLabel: 'v1',
      status: ProductOfferingVersionStatus.ACTIVE,
      isCurrent: true,
      publishedAt: new Date(),
      productTypeProfileId: catalogProfile.id,
      fixedPrice: 38,
    },
    select: { id: true },
  });

  const group = await prisma.configurationGroup.create({
    data: {
      productOfferingVersionId: version.id,
      name: 'Specifications',
      code: 'specifications',
      sortOrder: 1,
    },
    select: { id: true },
  });

  const specs: Array<{ code: string; label: string; value: string; sortOrder: number }> = [
    { code: 'moq', label: 'Minimum Order Quantity', value: '50', sortOrder: 1 },
    { code: 'size', label: 'Size', value: '6 x 8 inch', sortOrder: 2 },
    { code: 'cover', label: 'Cover', value: 'Both Side Printing', sortOrder: 3 },
    { code: 'inner', label: 'Inner', value: 'Single Side Printing - 2 Leaf', sortOrder: 4 },
    { code: 'lamination', label: 'Lamination', value: 'Velvet', sortOrder: 5 },
    { code: 'cutting', label: 'Cutting', value: 'Die Cut', sortOrder: 6 },
    { code: 'packaging', label: 'Packaging', value: 'Poly Pack', sortOrder: 7 },
    { code: 'address_sticker', label: 'Address Sticker', value: 'Included', sortOrder: 8 },
    { code: 'gst', label: 'GST', value: '18% extra', sortOrder: 9 },
  ];

  for (const spec of specs) {
    const field = await prisma.configurationField.create({
      data: {
        productOfferingVersionId: version.id,
        groupId: group.id,
        code: spec.code,
        label: spec.label,
        fieldType: ConfigurationFieldType.DROPDOWN,
        isRequired: false,
        isVisible: true,
        sortOrder: spec.sortOrder,
      },
      select: { id: true },
    });
    await prisma.configurationOption.create({
      data: {
        fieldId: field.id,
        label: spec.value,
        value: spec.value,
        isDefault: true,
        sortOrder: 1,
      },
    });
  }

  await prisma.productOfferingWorkflow.create({
    data: {
      productOfferingVersionId: version.id,
      workflowTemplateId,
      isDefault: true,
    },
  });

  console.log('✔ wedding card product "Royal Velvet Wedding Card" (order code 1201) with 9 specs, bound to the design-approval workflow');
  console.log('  No photos attached yet — add real product photography via the admin catalog UI (Products > this offering > Images).');
}

async function main() {
  const facilityId = await ensureFacility();

  const departments: Record<string, string> = {
    DESIGN: await ensureDepartment(facilityId, DESIGN_DEPARTMENT_CODE, 'Design', 5),
    PRINTING: await ensureDepartment(facilityId, 'PRINTING', 'Printing', 10),
  };
  console.log('✔ departments');

  await ensureProfiles();
  const workflowTemplateId = await ensureWeddingCardTemplate(facilityId, departments);
  await ensureWeddingCardProduct(workflowTemplateId);

  console.log('\nPhase 4 setup complete.');
  console.log('To make another product use this flow, set its version\'s productTypeProfileId to the');
  console.log('CATALOG_DESIGN_APPROVAL profile and give it a fixedPrice.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
