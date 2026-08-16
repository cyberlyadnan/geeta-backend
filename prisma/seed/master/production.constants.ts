import type { WorkflowStepType } from '@prisma/client';

export const FACILITY_CODE = 'GEETA-MAIN';

export interface DepartmentDef {
  code: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

export const PRODUCTION_DEPARTMENTS: DepartmentDef[] = [
  {
    code: 'PRODUCTION_PLANNING',
    name: 'Production Planning',
    description: 'Capacity planning, scheduling, and job prioritization',
    color: '#0EA5E9',
    sortOrder: 5,
  },
  {
    code: 'DESIGN',
    name: 'Design',
    description: 'Original design work and vendor proof/sample approval gates',
    color: '#EC4899',
    sortOrder: 7,
  },
  {
    code: 'ARTWORK',
    name: 'Artwork',
    description: 'Prepress, artwork verification, and file preparation',
    color: '#8B5CF6',
    sortOrder: 10,
  },
  {
    code: 'DIGITAL_PRINT',
    name: 'Digital Printing',
    description: 'Digital sheet and card production',
    color: '#3B82F6',
    sortOrder: 20,
  },
  {
    code: 'OFFSET_PRINT',
    name: 'Offset Printing',
    description: 'Offset lithography for catalogues and booklets',
    color: '#1D4ED8',
    sortOrder: 30,
  },
  {
    code: 'UV_PRINT',
    name: 'UV Printing',
    description: 'UV coating, spot UV, and acrylic production',
    color: '#06B6D4',
    sortOrder: 40,
  },
  {
    code: 'FOILING',
    name: 'Foiling',
    description: 'Hot foil stamping and metallic finishes',
    color: '#EAB308',
    sortOrder: 50,
  },
  {
    code: 'EMBOSSING',
    name: 'Embossing',
    description: 'Emboss, deboss, and tactile finishes',
    color: '#A855F7',
    sortOrder: 60,
  },
  {
    code: 'LAMINATION',
    name: 'Lamination',
    description: 'Matt, gloss, and soft-touch lamination',
    color: '#10B981',
    sortOrder: 70,
  },
  {
    code: 'CUTTING',
    name: 'Cutting',
    description: 'Die cutting, trimming, and guillotine',
    color: '#F97316',
    sortOrder: 80,
  },
  {
    code: 'BINDING',
    name: 'Binding',
    description: 'Perfect bind, wiro, saddle stitch, and finishing',
    color: '#6366F1',
    sortOrder: 90,
  },
  {
    code: 'QC',
    name: 'Quality Control',
    description: 'In-process and final quality inspection',
    color: '#EF4444',
    sortOrder: 100,
  },
  {
    code: 'PACKING',
    name: 'Packing',
    description: 'Packing, labeling, and order consolidation',
    color: '#84CC16',
    sortOrder: 110,
  },
  {
    code: 'DISPATCH',
    name: 'Dispatch',
    description: 'Courier handoff and dispatch tracking',
    color: '#64748B',
    sortOrder: 120,
  },
  {
    code: 'CUSTOMER_SUPPORT',
    name: 'Customer Support',
    description: 'Vendor communication and order assistance',
    color: '#14B8A6',
    sortOrder: 130,
  },
];

export interface WorkflowStepDef {
  stepCode: string;
  stepName: string;
  departmentCode: string;
  stepType: WorkflowStepType;
  stepOrder: number;
  expectedMinutes: number;
  instructions?: string;
  allowRework?: boolean;
  metadata?: Record<string, unknown>;
  sla?: { warningAfterMinutes: number; criticalAfterMinutes: number };
}

export interface WorkflowTemplateDef {
  code: string;
  name: string;
  description: string;
  isDefault?: boolean;
  steps: WorkflowStepDef[];
}

const STANDARD_FINISH: WorkflowStepDef[] = [
  {
    stepCode: 'ARTWORK_VERIFICATION',
    stepName: 'Artwork Verification',
    departmentCode: 'ARTWORK',
    stepType: 'VERIFICATION',
    stepOrder: 1,
    expectedMinutes: 30,
    instructions: 'Verify resolution, bleed, safe area, and color profile before releasing to production.',
    sla: { warningAfterMinutes: 45, criticalAfterMinutes: 90 },
  },
];

const STANDARD_QC: WorkflowStepDef = {
  stepCode: 'QUALITY_CHECK',
  stepName: 'Quality Check',
  departmentCode: 'QC',
  stepType: 'QUALITY_CHECK',
  stepOrder: 0,
  expectedMinutes: 25,
  allowRework: true,
  instructions: 'Complete the QC checklist. Failures route to the configured rework target step.',
  sla: { warningAfterMinutes: 30, criticalAfterMinutes: 60 },
};

const STANDARD_PACK_DISPATCH: WorkflowStepDef[] = [
  {
    stepCode: 'PACKING',
    stepName: 'Packing',
    departmentCode: 'PACKING',
    stepType: 'PACKAGING',
    stepOrder: 0,
    expectedMinutes: 20,
    instructions: 'Pack per quantity, include job card, and label for dispatch.',
    sla: { warningAfterMinutes: 30, criticalAfterMinutes: 60 },
  },
  {
    stepCode: 'DISPATCH',
    stepName: 'Dispatch',
    departmentCode: 'DISPATCH',
    stepType: 'DISPATCH',
    stepOrder: 0,
    expectedMinutes: 15,
    instructions: 'Hand over to courier or mark ready for vendor pickup.',
    sla: { warningAfterMinutes: 20, criticalAfterMinutes: 45 },
  },
];

function withFinish(
  productionSteps: WorkflowStepDef[],
  reworkTargetStepCode: string,
): WorkflowStepDef[] {
  const steps = [...STANDARD_FINISH, ...productionSteps];
  let order = 1;
  const numbered = steps.map((s) => ({ ...s, stepOrder: order++ }));

  const qc: WorkflowStepDef = {
    ...STANDARD_QC,
    stepOrder: order++,
    metadata: { reworkTargetStepCode },
  };

  const packDispatch = STANDARD_PACK_DISPATCH.map((s) => ({ ...s, stepOrder: order++ }));
  return [...numbered, qc, ...packDispatch];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateDef[] = [
  {
    code: 'WF-STANDARD-PRODUCTION',
    name: 'Standard Production Workflow',
    description: 'Default end-to-end workflow for general print products',
    isDefault: true,
    steps: withFinish(
      [
        {
          stepCode: 'DIGITAL_PRINTING',
          stepName: 'Digital Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 120,
          instructions: 'Run on assigned digital press. Match color profile and quantity.',
          sla: { warningAfterMinutes: 150, criticalAfterMinutes: 300 },
        },
      ],
      'DIGITAL_PRINTING',
    ),
  },
  {
    code: 'WF-DIGITAL',
    name: 'Digital Print Workflow',
    description: 'Visiting cards, flyers, and short-run digital jobs',
    steps: withFinish(
      [
        {
          stepCode: 'DIGITAL_PRINTING',
          stepName: 'Digital Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 90,
          sla: { warningAfterMinutes: 120, criticalAfterMinutes: 240 },
        },
        {
          stepCode: 'CUTTING',
          stepName: 'Cutting & Trimming',
          departmentCode: 'CUTTING',
          stepType: 'DIE_CUTTING',
          stepOrder: 3,
          expectedMinutes: 45,
          sla: { warningAfterMinutes: 60, criticalAfterMinutes: 120 },
        },
      ],
      'DIGITAL_PRINTING',
    ),
  },
  {
    code: 'WF-OFFSET',
    name: 'Offset Print Workflow',
    description: 'Booklets, catalogues, and long-run offset jobs',
    steps: withFinish(
      [
        {
          stepCode: 'OFFSET_PRINTING',
          stepName: 'Offset Printing',
          departmentCode: 'OFFSET_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 240,
          sla: { warningAfterMinutes: 300, criticalAfterMinutes: 480 },
        },
        {
          stepCode: 'BINDING',
          stepName: 'Binding',
          departmentCode: 'BINDING',
          stepType: 'CUSTOM',
          stepOrder: 3,
          expectedMinutes: 90,
          instructions: 'Perfect bind, saddle stitch, or wiro per job card.',
          sla: { warningAfterMinutes: 120, criticalAfterMinutes: 240 },
        },
      ],
      'OFFSET_PRINTING',
    ),
  },
  {
    code: 'WF-UV',
    name: 'UV Print Workflow',
    description: 'Acrylic, spot UV, and UV-coated products',
    steps: withFinish(
      [
        {
          stepCode: 'BASE_PRINTING',
          stepName: 'Base Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 90,
        },
        {
          stepCode: 'UV_COATING',
          stepName: 'UV Coating',
          departmentCode: 'UV_PRINT',
          stepType: 'UV',
          stepOrder: 3,
          expectedMinutes: 60,
          sla: { warningAfterMinutes: 90, criticalAfterMinutes: 180 },
        },
      ],
      'UV_COATING',
    ),
  },
  {
    code: 'WF-FOILING',
    name: 'Foiling Workflow',
    description: 'Gold, silver, and specialty foil products',
    steps: withFinish(
      [
        {
          stepCode: 'DIGITAL_PRINTING',
          stepName: 'Digital Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 90,
        },
        {
          stepCode: 'FOIL_STAMPING',
          stepName: 'Foil Stamping',
          departmentCode: 'FOILING',
          stepType: 'FOILING',
          stepOrder: 3,
          expectedMinutes: 75,
          sla: { warningAfterMinutes: 90, criticalAfterMinutes: 180 },
        },
      ],
      'FOIL_STAMPING',
    ),
  },
  {
    code: 'WF-LAMINATION',
    name: 'Lamination Workflow',
    description: 'Laminated brochures, menus, and protected print',
    steps: withFinish(
      [
        {
          stepCode: 'DIGITAL_PRINTING',
          stepName: 'Digital Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 90,
        },
        {
          stepCode: 'LAMINATION',
          stepName: 'Lamination',
          departmentCode: 'LAMINATION',
          stepType: 'LAMINATION',
          stepOrder: 3,
          expectedMinutes: 45,
          sla: { warningAfterMinutes: 60, criticalAfterMinutes: 120 },
        },
      ],
      'LAMINATION',
    ),
  },
  {
    code: 'WF-FLEX',
    name: 'Flex Banner Workflow',
    description: 'Flex, vinyl, and outdoor banner production',
    steps: withFinish(
      [
        {
          stepCode: 'LARGE_FORMAT_PRINT',
          stepName: 'Large Format Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 120,
          instructions: 'Print on flex or vinyl roll. Check eyelets and finishing specs.',
          sla: { warningAfterMinutes: 150, criticalAfterMinutes: 300 },
        },
      ],
      'LARGE_FORMAT_PRINT',
    ),
  },
  {
    code: 'WF-LARGE_FORMAT',
    name: 'Large Format Workflow',
    description: 'Posters, canvas, and wide-format with lamination',
    steps: withFinish(
      [
        {
          stepCode: 'LARGE_FORMAT_PRINT',
          stepName: 'Large Format Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 150,
        },
        {
          stepCode: 'LAMINATION',
          stepName: 'Lamination',
          departmentCode: 'LAMINATION',
          stepType: 'LAMINATION',
          stepOrder: 3,
          expectedMinutes: 60,
        },
      ],
      'LARGE_FORMAT_PRINT',
    ),
  },
  {
    code: 'WF-DIE_CUT',
    name: 'Die Cut Packaging Workflow',
    description: 'Folding cartons, boxes, and die-cut packaging',
    steps: withFinish(
      [
        {
          stepCode: 'DIGITAL_PRINTING',
          stepName: 'Sheet Printing',
          departmentCode: 'DIGITAL_PRINT',
          stepType: 'PRINTING',
          stepOrder: 2,
          expectedMinutes: 120,
        },
        {
          stepCode: 'DIE_CUTTING',
          stepName: 'Die Cutting',
          departmentCode: 'CUTTING',
          stepType: 'DIE_CUTTING',
          stepOrder: 3,
          expectedMinutes: 90,
          sla: { warningAfterMinutes: 120, criticalAfterMinutes: 240 },
        },
      ],
      'DIE_CUTTING',
    ),
  },
];

/** Default test password for seeded production users (override via env). */
export const DEFAULT_TEST_USER_PASSWORD = process.env.SEED_TEST_USER_PASSWORD ?? 'Geeta@12345';
