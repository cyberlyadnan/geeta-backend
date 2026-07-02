import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import type { CreateQcTemplateInput, CursorQuery } from './system-admin.validation.js';

export class SystemQcService {
  async listTemplates(query: CursorQuery) {
    const limit = query.limit;
    const rows = await prisma.qualityChecklistTemplate.findMany({
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
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        workflowTemplateStepId: true,
        productOfferingVersionId: true,
        workflowTemplateStep: {
          select: {
            stepName: true,
            stepCode: true,
            workflowTemplate: { select: { code: true, name: true } },
          },
        },
        _count: { select: { items: true, inspections: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((t) => ({ ...t, itemCount: t._count.items, inspectionCount: t._count.inspections })),
      meta: { nextCursor: hasMore ? items[items.length - 1]?.id : undefined, hasMore, limit },
    };
  }

  async getTemplate(templateId: string) {
    const template = await prisma.qualityChecklistTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        workflowTemplateStep: {
          select: {
            id: true,
            stepName: true,
            workflowTemplate: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!template) throw ApiError.notFound('QC template not found');
    return template;
  }

  async upsertTemplate(input: CreateQcTemplateInput & { id?: string }) {
    const template = input.id
      ? await prisma.qualityChecklistTemplate.update({
          where: { id: input.id },
          data: {
            code: input.code,
            name: input.name,
            description: input.description,
            isActive: input.isActive,
            workflowTemplateStepId: input.workflowTemplateStepId ?? null,
            productOfferingVersionId: input.productOfferingVersionId ?? null,
          },
        })
      : await prisma.qualityChecklistTemplate.create({
          data: {
            code: input.code,
            name: input.name,
            description: input.description,
            isActive: input.isActive,
            workflowTemplateStepId: input.workflowTemplateStepId ?? null,
            productOfferingVersionId: input.productOfferingVersionId ?? null,
          },
        });

    if (input.items?.length) {
      for (const item of input.items) {
        await prisma.qualityChecklistTemplateItem.upsert({
          where: { templateId_itemCode: { templateId: template.id, itemCode: item.itemCode } },
          update: {
            label: item.label,
            description: item.description,
            sortOrder: item.sortOrder,
            isRequired: item.isRequired,
          },
          create: { templateId: template.id, ...item },
        });
      }
    }

    return this.getTemplate(template.id);
  }
}

export const systemQcService = new SystemQcService();
