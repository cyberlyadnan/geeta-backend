import { Prisma, WorkflowStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { WORKFLOW_TEMPLATE_WITH_STEPS } from '../workflow/workflow.repository.js';
import { workflowTemplateCache } from '../workflow/workflow.cache.js';
import { resolveFacilityId } from './ensure-default-facility.js';
import type {
  CreateWorkflowTemplateInput,
  CursorQuery,
  SaveWorkflowStepsInput,
  UpdateWorkflowTemplateInput,
} from './system-admin.validation.js';

export class SystemWorkflowsService {
  async list(query: CursorQuery) {
    const limit = query.limit;
    const rows = await prisma.workflowTemplate.findMany({
      where: query.search?.trim()
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
              { code: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : undefined,
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        status: true,
        isDefault: true,
        facilityId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { steps: true, workflowInstances: true, productOfferingWorkflows: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((t) => ({
        ...t,
        stepCount: t._count.steps,
        instanceCount: t._count.workflowInstances,
        productLinkCount: t._count.productOfferingWorkflows,
      })),
      meta: { nextCursor: hasMore ? items[items.length - 1]?.id : undefined, hasMore, limit },
    };
  }

  async getById(templateId: string) {
    const template = await prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      select: {
        ...WORKFLOW_TEMPLATE_WITH_STEPS,
        description: true,
        facilityId: true,
        createdAt: true,
        updatedAt: true,
        steps: {
          orderBy: { stepOrder: 'asc' },
          select: {
            id: true,
            departmentId: true,
            stepName: true,
            stepCode: true,
            stepType: true,
            stepOrder: true,
            expectedMinutes: true,
            allowRework: true,
            allowSkip: true,
            isMandatory: true,
            instructions: true,
            metadata: true,
            department: { select: { id: true, code: true, name: true } },
            slaPolicy: true,
            dependencies: {
              select: {
                id: true,
                dependsOnStepId: true,
                dependencyType: true,
              },
            },
            checklistTemplates: {
              where: { isActive: true },
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });
    if (!template) throw ApiError.notFound('Workflow template not found');
    return template;
  }

  async create(input: CreateWorkflowTemplateInput) {
    const existing = await prisma.workflowTemplate.findUnique({ where: { code: input.code } });
    if (existing) throw ApiError.conflict('Workflow template code already exists');

    if (input.isDefault) {
      await prisma.workflowTemplate.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
    }

    const facilityId = await resolveFacilityId(input.facilityId);

    const template = await prisma.workflowTemplate.create({
      data: {
        facilityId,
        name: input.name,
        code: input.code,
        description: input.description,
        status: WorkflowStatus.ACTIVE,
        isDefault: input.isDefault ?? false,
      },
    });

    await workflowTemplateCache.invalidateTemplate(template.id);
    return template;
  }

  async update(templateId: string, input: UpdateWorkflowTemplateInput) {
    const template = await prisma.workflowTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw ApiError.notFound('Workflow template not found');

    if (input.isDefault) {
      await prisma.workflowTemplate.updateMany({
        data: { isDefault: false },
        where: { isDefault: true, id: { not: templateId } },
      });
    }

    const updated = await prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status as WorkflowStatus } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });

    await workflowTemplateCache.invalidateTemplate(templateId);
    return updated;
  }

  async duplicate(templateId: string, newCode: string, newName: string) {
    const source = await this.getById(templateId);
    const created = await this.create({
      facilityId: source.facilityId,
      name: newName,
      code: newCode,
      description: source.description ?? undefined,
    });

    await this.saveSteps(created.id, {
      steps: source.steps.map((step) => ({
        departmentId: step.departmentId,
        stepName: step.stepName,
        stepCode: step.stepCode,
        stepType: step.stepType,
        stepOrder: step.stepOrder,
        expectedMinutes: step.expectedMinutes,
        allowRework: step.allowRework,
        allowSkip: step.allowSkip,
        isMandatory: step.isMandatory,
        instructions: step.instructions,
        metadata: (step.metadata as Record<string, unknown>) ?? {},
        sla: step.slaPolicy
          ? {
              warningAfterMinutes: step.slaPolicy.warningAfterMinutes,
              criticalAfterMinutes: step.slaPolicy.criticalAfterMinutes,
            }
          : undefined,
      })),
    });

    return this.getById(created.id);
  }

  async archive(templateId: string) {
    return this.update(templateId, { status: WorkflowStatus.ARCHIVED, isDefault: false });
  }

  async saveSteps(templateId: string, input: SaveWorkflowStepsInput) {
    const template = await prisma.workflowTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw ApiError.notFound('Workflow template not found');

    const existingSteps = await prisma.workflowTemplateStep.findMany({
      where: { workflowTemplateId: templateId },
      select: { id: true },
    });
    const existingIds = new Set(existingSteps.map((s) => s.id));
    const incomingIds = new Set(
      input.steps.map((step) => step.id).filter((id): id is string => Boolean(id)),
    );

    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      await prisma.workflowTemplateStep.deleteMany({ where: { id: { in: toDelete } } });
    }

    const sortedSteps = [...input.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const stepIdByOrder = new Map<number, string>();

    for (const step of sortedSteps) {
      const data = {
        workflowTemplateId: templateId,
        departmentId: step.departmentId,
        stepName: step.stepName,
        stepCode: step.stepCode,
        stepType: step.stepType,
        stepOrder: step.stepOrder,
        expectedMinutes: step.expectedMinutes,
        allowRework: step.allowRework ?? true,
        allowSkip: step.allowSkip ?? false,
        isMandatory: step.isMandatory ?? true,
        instructions: step.instructions ?? null,
        metadata: (step.metadata ?? {}) as Prisma.InputJsonValue,
      };

      const record = step.id
        ? await prisma.workflowTemplateStep.update({ where: { id: step.id }, data })
        : await prisma.workflowTemplateStep.create({ data });

      stepIdByOrder.set(step.stepOrder, record.id);

      if (step.sla) {
        await prisma.workflowSlaPolicy.upsert({
          where: { workflowTemplateStepId: record.id },
          update: step.sla,
          create: { workflowTemplateStepId: record.id, ...step.sla },
        });
      }
    }

    await prisma.workflowTemplateStepDependency.deleteMany({
      where: { workflowTemplateStep: { workflowTemplateId: templateId } },
    });

    for (const step of sortedSteps) {
      const stepId = step.id ?? stepIdByOrder.get(step.stepOrder);
      if (!stepId) continue;

      const depIds =
        step.dependsOnStepIds ??
        (step.stepOrder > 1 ? [stepIdByOrder.get(step.stepOrder - 1)!].filter(Boolean) : []);

      for (const depId of depIds) {
        await prisma.workflowTemplateStepDependency.create({
          data: {
            workflowTemplateStepId: stepId,
            dependsOnStepId: depId,
            dependencyType: 'FINISH_TO_START',
          },
        });
      }
    }

    await workflowTemplateCache.invalidateTemplate(templateId);
    return this.getById(templateId);
  }
}

export const systemWorkflowsService = new SystemWorkflowsService();
