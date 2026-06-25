import type { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';
import { enqueueActivityLog } from '../../queues/activity-log.queue.js';

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

  /**
   * Non-blocking write for request hot paths.
   * Uses BullMQ when Redis is available; falls back to fire-and-forget DB write.
   */
  logAsync(input: LogActivityInput): void {
    void enqueueActivityLog(input)
      .then((queued) => {
        if (queued) return;
        return this.log(input);
      })
      .catch((err) => {
        logger.warn('Activity log failed (non-blocking)', {
          action: input.action,
          entityId: input.entityId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }

  async listByVendor(vendorProfileId: string, limit = 50) {
    return prisma.activityLog.findMany({
      where: { vendorProfileId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: this.actorInclude(),
    });
  }

  async listRecentVendorActivity(limit = 25) {
    return prisma.activityLog.findMany({
      where: { vendorProfileId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        ...this.actorInclude(),
        vendorProfile: {
          select: {
            id: true,
            vendorCode: true,
            businessName: true,
            ownerName: true,
            accountStatus: true,
          },
        },
      },
    });
  }

  private actorInclude() {
    return {
      actor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    } as const;
  }
}

export const activityLogService = new ActivityLogService();
