import type { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

export interface LogActivityInput {
  action: ActivityAction;
  entityType: string;
  entityId: string;
  vendorProfileId?: string;
  actorId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export class ActivityLogService {
  async log(input: LogActivityInput) {
    return prisma.activityLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        vendorProfileId: input.vendorProfileId,
        actorId: input.actorId,
        metadata: input.metadata ?? {},
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async listByVendor(vendorProfileId: string, limit = 50) {
    return prisma.activityLog.findMany({
      where: { vendorProfileId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
}

export const activityLogService = new ActivityLogService();
