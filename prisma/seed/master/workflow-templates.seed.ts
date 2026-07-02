import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';
import { FACILITY_CODE, WORKFLOW_TEMPLATES } from './production.constants.js';

export async function seedWorkflowTemplates(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('workflow-templates');
  const { prisma, registry } = ctx;

  const facilityId = registry.facilityId;
  if (!facilityId) {
    log.warn('Facility missing — run departments seed first');
    return;
  }

  log.info(`Seeding ${WORKFLOW_TEMPLATES.length} workflow templates...`);
  registry.workflowTemplates.clear();

  for (const def of WORKFLOW_TEMPLATES) {
    const template = await prisma.workflowTemplate.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description,
        status: 'ACTIVE',
        isDefault: def.isDefault ?? false,
        facilityId,
      },
      create: {
        facilityId,
        name: def.name,
        code: def.code,
        description: def.description,
        status: 'ACTIVE',
        isDefault: def.isDefault ?? false,
      },
    });

    registry.workflowTemplates.set(def.code, template.id);

    const existingSteps = await prisma.workflowTemplateStep.findMany({
      where: { workflowTemplateId: template.id },
      select: { id: true, stepCode: true },
    });
    const stepIdsByCode = new Map(existingSteps.map((s) => [s.stepCode, s.id]));

    const orderedStepIds: string[] = [];

    for (const step of def.steps) {
      const departmentId = registry.departments.get(step.departmentCode);
      if (!departmentId) {
        log.warn(`Department ${step.departmentCode} not found for step ${step.stepCode}`);
        continue;
      }

      const existingId = stepIdsByCode.get(step.stepCode);
      const stepRecord = existingId
        ? await prisma.workflowTemplateStep.update({
            where: { id: existingId },
            data: {
              departmentId,
              stepName: step.stepName,
              stepCode: step.stepCode,
              stepType: step.stepType,
              stepOrder: step.stepOrder,
              expectedMinutes: step.expectedMinutes,
              instructions: step.instructions ?? null,
              isMandatory: true,
              allowRework: step.allowRework ?? true,
              metadata: step.metadata ?? {},
            },
          })
        : await prisma.workflowTemplateStep.create({
            data: {
              workflowTemplateId: template.id,
              departmentId,
              stepName: step.stepName,
              stepCode: step.stepCode,
              stepType: step.stepType,
              stepOrder: step.stepOrder,
              expectedMinutes: step.expectedMinutes,
              instructions: step.instructions ?? null,
              isMandatory: true,
              allowRework: step.allowRework ?? true,
              metadata: step.metadata ?? {},
            },
          });

      stepIdsByCode.set(step.stepCode, stepRecord.id);
      orderedStepIds.push(stepRecord.id);

      if (step.sla) {
        await prisma.workflowSlaPolicy.upsert({
          where: { workflowTemplateStepId: stepRecord.id },
          update: {
            warningAfterMinutes: step.sla.warningAfterMinutes,
            criticalAfterMinutes: step.sla.criticalAfterMinutes,
          },
          create: {
            workflowTemplateStepId: stepRecord.id,
            warningAfterMinutes: step.sla.warningAfterMinutes,
            criticalAfterMinutes: step.sla.criticalAfterMinutes,
          },
        });
      }
    }

    // Linear FINISH_TO_START dependencies between sequential steps
    const stepRecords = await prisma.workflowTemplateStep.findMany({
      where: { workflowTemplateId: template.id },
      orderBy: { stepOrder: 'asc' },
      select: { id: true, stepOrder: true },
    });

    for (let i = 1; i < stepRecords.length; i += 1) {
      const current = stepRecords[i]!;
      const previous = stepRecords[i - 1]!;
      await prisma.workflowTemplateStepDependency.upsert({
        where: {
          workflowTemplateStepId_dependsOnStepId: {
            workflowTemplateStepId: current.id,
            dependsOnStepId: previous.id,
          },
        },
        update: {},
        create: {
          workflowTemplateStepId: current.id,
          dependsOnStepId: previous.id,
          dependencyType: 'FINISH_TO_START',
        },
      });
    }
  }

  const defaultTemplate = WORKFLOW_TEMPLATES.find((t) => t.isDefault);
  if (defaultTemplate) {
    const defaultId = registry.workflowTemplates.get(defaultTemplate.code);
    if (defaultId) {
      await prisma.workflowTemplate.updateMany({
        where: { id: { not: defaultId }, isDefault: true },
        data: { isDefault: false },
      });
      await prisma.workflowTemplate.update({
        where: { id: defaultId },
        data: { isDefault: true },
      });
    }
  }

  log.info(`Workflow templates seeded at facility ${FACILITY_CODE}`);
}
