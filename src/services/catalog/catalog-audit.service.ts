import { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { activityLogService } from '../activity/activity-log.service.js';

export class CatalogAuditService {
  async logProductActivity(params: {
    action: ActivityAction;
    productId: string;
    actorId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await activityLogService.log({
      action: params.action,
      entityType: 'product_offering',
      entityId: params.productId,
      actorId: params.actorId,
      metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  async logAudit(params: {
    entityType: string;
    entityId: string;
    action: string;
    changedById?: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  }) {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        changedById: params.changedById,
        oldValues: (params.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
        newValues: (params.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listProductAudit(productId: string, limit = 50) {
    const [activity, audit] = await Promise.all([
      prisma.activityLog.findMany({
        where: { entityType: 'product_offering', entityId: productId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: { entityType: 'product_offering', entityId: productId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          changedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return { activity, audit };
  }
}

export const catalogAuditService = new CatalogAuditService();
