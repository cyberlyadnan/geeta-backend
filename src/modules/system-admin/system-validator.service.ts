import { WorkflowStepType } from '@prisma/client';
import { prisma } from '../../config/database.js';

export type ValidationSeverity = 'RED' | 'YELLOW' | 'GREEN';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: string;
  message: string;
  entityType?: string;
  entityId?: string;
  href?: string;
}

export class SystemValidatorService {
  async run(): Promise<{ summary: Record<ValidationSeverity, number>; issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = [];

    const [
      productsWithoutWorkflow,
      templatesWithoutSteps,
      stepsWithoutDepartment,
      departmentsWithoutOperators,
      machinesWithoutDepartment,
      productsWithoutPricing,
      qcStepsWithoutChecklist,
      inactiveTemplatesLinked,
    ] = await Promise.all([
      prisma.productOfferingVersion.findMany({
        where: { isCurrent: true, status: 'ACTIVE', deletedAt: null, workflow: null },
        take: 50,
        select: { id: true, productOffering: { select: { name: true, slug: true } } },
      }),
      prisma.workflowTemplate.findMany({
        where: { status: 'ACTIVE', steps: { none: {} } },
        select: { id: true, code: true, name: true },
      }),
      prisma.workflowTemplateStep.findMany({
        where: { department: { isActive: false } },
        take: 50,
        select: {
          id: true,
          stepName: true,
          department: { select: { code: true, name: true } },
          workflowTemplate: { select: { code: true } },
        },
      }),
      prisma.department.findMany({
        where: {
          isActive: true,
          staffAssignments: { none: { isActive: true } },
          workflowSteps: { some: {} },
        },
        select: { id: true, code: true, name: true },
      }),
      prisma.machine.findMany({
        where: { isActive: true, department: { isActive: false } },
        select: { id: true, machineCode: true, machineName: true },
      }),
      prisma.productOfferingVersion.findMany({
        where: {
          isCurrent: true,
          status: 'ACTIVE',
          deletedAt: null,
          quantityPricing: { none: {} },
        },
        take: 50,
        select: { id: true, productOffering: { select: { name: true, slug: true } } },
      }),
      prisma.workflowTemplateStep.findMany({
        where: {
          stepType: WorkflowStepType.QUALITY_CHECK,
          checklistTemplates: { none: { isActive: true } },
        },
        select: {
          id: true,
          stepName: true,
          workflowTemplate: { select: { code: true, name: true } },
        },
      }),
      prisma.productOfferingWorkflow.findMany({
        where: { workflowTemplate: { status: { not: 'ACTIVE' } } },
        take: 50,
        select: {
          id: true,
          productOfferingVersion: { select: { productOffering: { select: { name: true } } } },
          workflowTemplate: { select: { code: true, status: true } },
        },
      }),
    ]);

    for (const v of productsWithoutWorkflow) {
      issues.push({
        id: `product-no-wf-${v.id}`,
        severity: 'RED',
        category: 'Product Workflow',
        message: `Product "${v.productOffering.name}" has no workflow linked`,
        entityType: 'PRODUCT_VERSION',
        entityId: v.id,
      });
    }

    for (const t of templatesWithoutSteps) {
      issues.push({
        id: `wf-no-steps-${t.id}`,
        severity: 'RED',
        category: 'Workflow',
        message: `Workflow "${t.code}" has no steps`,
        entityType: 'WORKFLOW_TEMPLATE',
        entityId: t.id,
      });
    }

    for (const s of stepsWithoutDepartment) {
      issues.push({
        id: `step-dept-${s.id}`,
        severity: 'YELLOW',
        category: 'Workflow Step',
        message: `Step "${s.stepName}" in ${s.workflowTemplate.code} uses inactive department ${s.department.code}`,
        entityType: 'WORKFLOW_STEP',
        entityId: s.id,
      });
    }

    for (const d of departmentsWithoutOperators) {
      issues.push({
        id: `dept-no-op-${d.id}`,
        severity: 'YELLOW',
        category: 'Department',
        message: `Department "${d.name}" has workflow steps but no assigned operators`,
        entityType: 'DEPARTMENT',
        entityId: d.id,
      });
    }

    for (const m of machinesWithoutDepartment) {
      issues.push({
        id: `machine-dept-${m.id}`,
        severity: 'RED',
        category: 'Machine',
        message: `Machine "${m.machineCode}" is linked to an inactive department`,
        entityType: 'MACHINE',
        entityId: m.id,
      });
    }

    for (const p of productsWithoutPricing) {
      issues.push({
        id: `product-price-${p.id}`,
        severity: 'YELLOW',
        category: 'Pricing',
        message: `Product "${p.productOffering.name}" has no quantity pricing tiers`,
        entityType: 'PRODUCT_VERSION',
        entityId: p.id,
      });
    }

    for (const s of qcStepsWithoutChecklist) {
      issues.push({
        id: `qc-no-checklist-${s.id}`,
        severity: 'RED',
        category: 'Quality Control',
        message: `QC step "${s.stepName}" in ${s.workflowTemplate.code} has no active checklist`,
        entityType: 'WORKFLOW_STEP',
        entityId: s.id,
      });
    }

    for (const link of inactiveTemplatesLinked) {
      issues.push({
        id: `inactive-wf-link-${link.id}`,
        severity: 'YELLOW',
        category: 'Product Workflow',
        message: `Product "${link.productOfferingVersion.productOffering.name}" linked to inactive template ${link.workflowTemplate.code}`,
        entityType: 'PRODUCT_WORKFLOW',
        entityId: link.id,
      });
    }

    const summary = {
      RED: issues.filter((i) => i.severity === 'RED').length,
      YELLOW: issues.filter((i) => i.severity === 'YELLOW').length,
      GREEN: issues.length === 0 ? 1 : 0,
    };

    return { summary, issues };
  }
}

export const systemValidatorService = new SystemValidatorService();
