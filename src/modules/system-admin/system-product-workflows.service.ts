import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { workflowTemplateCache } from '../workflow/workflow.cache.js';
import type { CursorQuery, LinkProductWorkflowInput } from './system-admin.validation.js';

export class SystemProductWorkflowsService {
  async list(query: CursorQuery & { unlinkedOnly?: boolean }) {
    const limit = query.limit;
    const versions = await prisma.productOfferingVersion.findMany({
      where: {
        isCurrent: true,
        deletedAt: null,
        status: 'ACTIVE',
        ...(query.search?.trim()
          ? {
              productOffering: {
                OR: [
                  { name: { contains: query.search.trim(), mode: 'insensitive' } },
                  { slug: { contains: query.search.trim(), mode: 'insensitive' } },
                ],
              },
            }
          : {}),
        ...(query.unlinkedOnly ? { workflow: null } : {}),
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        versionLabel: true,
        productOffering: {
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            series: {
              select: {
                family: { select: { category: { select: { name: true, slug: true } } } },
              },
            },
          },
        },
        workflow: {
          select: {
            id: true,
            isDefault: true,
            workflowTemplate: { select: { id: true, code: true, name: true, status: true } },
          },
        },
      },
    });

    const hasMore = versions.length > limit;
    const items = hasMore ? versions.slice(0, limit) : versions;

    return {
      items,
      meta: { nextCursor: hasMore ? items[items.length - 1]?.id : undefined, hasMore, limit },
    };
  }

  async link(input: LinkProductWorkflowInput) {
    const [version, template] = await Promise.all([
      prisma.productOfferingVersion.findUnique({ where: { id: input.productOfferingVersionId } }),
      prisma.workflowTemplate.findUnique({ where: { id: input.workflowTemplateId } }),
    ]);
    if (!version) throw ApiError.notFound('Product version not found');
    if (!template) throw ApiError.notFound('Workflow template not found');

    const link = await prisma.productOfferingWorkflow.upsert({
      where: { productOfferingVersionId: input.productOfferingVersionId },
      update: { workflowTemplateId: input.workflowTemplateId, isDefault: input.isDefault },
      create: {
        productOfferingVersionId: input.productOfferingVersionId,
        workflowTemplateId: input.workflowTemplateId,
        isDefault: input.isDefault,
      },
      include: {
        workflowTemplate: { select: { id: true, code: true, name: true } },
      },
    });

    await workflowTemplateCache.invalidateTemplate(input.workflowTemplateId);
    return link;
  }
}

export const systemProductWorkflowsService = new SystemProductWorkflowsService();
