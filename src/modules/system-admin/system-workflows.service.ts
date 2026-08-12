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
            locksAmendmentsOnStart: true,
            skipWhen: true,
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
        locksAmendmentsOnStart: step.locksAmendmentsOnStart,
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

  async getConfigFields(templateId: string) {
    const links = await prisma.productOfferingWorkflow.findMany({
      where: { workflowTemplateId: templateId },
      select: { productOfferingVersionId: true },
    });

    if (links.length === 0) return [];

    const versionIds = links.map((l) => l.productOfferingVersionId);

    const fields = await prisma.configurationField.findMany({
      where: { productOfferingVersionId: { in: versionIds } },
      orderBy: { sortOrder: 'asc' },
      select: {
        code: true,
        label: true,
        options: {
          orderBy: { sortOrder: 'asc' },
          select: { label: true, value: true },
        },
      },
    });

    const seen = new Map<string, { code: string; label: string; options: { label: string; value: string }[] }>();
    for (const f of fields) {
      const existing = seen.get(f.code);
      if (!existing) {
        seen.set(f.code, { code: f.code, label: f.label, options: [...f.options] });
      } else {
        for (const opt of f.options) {
          if (!existing.options.some((o) => o.value === opt.value)) {
            existing.options.push(opt);
          }
        }
      }
    }

    return [...seen.values()];
  }

  async saveSteps(templateId: string, input: SaveWorkflowStepsInput) {
    const template = await prisma.workflowTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw ApiError.notFound('Workflow template not found');

    // Check for duplicate step codes in the input payload
    const codeCounts = new Map<string, number>();
    for (const s of input.steps) {
      const normalizedCode = s.stepCode.trim().toUpperCase();
      if (codeCounts.has(normalizedCode)) {
        throw ApiError.badRequest(`Duplicate step code '${s.stepCode.trim()}' found. Step codes must be unique.`);
      }
      codeCounts.set(normalizedCode, 1);
    }

    const existingSteps = await prisma.workflowTemplateStep.findMany({
      where: { workflowTemplateId: templateId },
      select: { id: true },
    });
    const existingIds = new Set(existingSteps.map((s) => s.id));
    const incomingIds = new Set(
      input.steps.map((step) => step.id).filter((id): id is string => Boolean(id)),
    );

    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    const sortedSteps = [...input.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const stepIdByOrder = new Map<number, string>();

    // Execute all step modifications inside an optimized transaction with 30s timeout
    await prisma.$transaction(
      async (tx) => {
        // 1. Instantly negate step_order for all existing steps using raw SQL (1-2 ms)
        //    This prevents @@unique([workflowTemplateId, stepOrder]) collisions during reordering
        await tx.$executeRaw`
          UPDATE workflow_template_steps
          SET step_order = -step_order - 10000
          WHERE workflow_template_id = ${templateId}
        `;

        // 2. Delete steps no longer present in incoming list
        if (toDelete.length > 0) {
          await tx.workflowTemplateStep.deleteMany({ where: { id: { in: toDelete } } });
        }

        // 3. Upsert steps with their final clean stepOrder (1..N)
        for (const step of sortedSteps) {
          const data = {
            workflowTemplateId: templateId,
            departmentId: step.departmentId,
            stepName: step.stepName.trim(),
            stepCode: step.stepCode.trim().toUpperCase(),
            stepType: step.stepType,
            stepOrder: step.stepOrder,
            expectedMinutes: step.expectedMinutes,
            allowRework: step.allowRework ?? true,
            allowSkip: step.allowSkip ?? false,
            isMandatory: step.isMandatory ?? true,
            locksAmendmentsOnStart: step.locksAmendmentsOnStart ?? false,
            instructions: step.instructions?.trim() ? step.instructions.trim() : null,
            metadata: (step.metadata ?? {}) as Prisma.InputJsonValue,
            skipWhen: step.skipWhen !== undefined
              ? (step.skipWhen as Prisma.InputJsonValue ?? Prisma.DbNull)
              : undefined,
          };

          const record = step.id
            ? await tx.workflowTemplateStep.update({ where: { id: step.id }, data })
            : await tx.workflowTemplateStep.create({ data });

          stepIdByOrder.set(step.stepOrder, record.id);

          if (step.sla) {
            await tx.workflowSlaPolicy.upsert({
              where: { workflowTemplateStepId: record.id },
              update: step.sla,
              create: { workflowTemplateStepId: record.id, ...step.sla },
            });
          }
        }

        // 4. Re-link step dependencies in bulk
        await tx.workflowTemplateStepDependency.deleteMany({
          where: { workflowTemplateStep: { workflowTemplateId: templateId } },
        });

        const depPayloads: Array<{
          workflowTemplateStepId: string;
          dependsOnStepId: string;
          dependencyType: 'FINISH_TO_START';
        }> = [];

        for (const step of sortedSteps) {
          const stepId = step.id ?? stepIdByOrder.get(step.stepOrder);
          if (!stepId) continue;

          const depIds =
            step.dependsOnStepIds ??
            (step.stepOrder > 1 ? [stepIdByOrder.get(step.stepOrder - 1)!].filter(Boolean) : []);

          for (const depId of depIds) {
            depPayloads.push({
              workflowTemplateStepId: stepId,
              dependsOnStepId: depId,
              dependencyType: 'FINISH_TO_START',
            });
          }
        }

        if (depPayloads.length > 0) {
          await tx.workflowTemplateStepDependency.createMany({
            data: depPayloads,
          });
        }
      },
      {
        timeout: 30000,
        maxWait: 10000,
      },
    );

    await workflowTemplateCache.invalidateTemplate(templateId);
    return this.getById(templateId);
  }
}

export const systemWorkflowsService = new SystemWorkflowsService();
