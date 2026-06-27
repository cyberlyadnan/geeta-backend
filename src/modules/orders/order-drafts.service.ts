import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { ActivityAction } from '@prisma/client';
import { activityLogService } from '../../services/activity/activity-log.service.js';
import type { Prisma } from '@prisma/client';

export class OrderDraftsService {
  async list(userId: string) {
    return prisma.vendorOrderDraft.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  async getById(userId: string, id: string) {
    const draft = await prisma.vendorOrderDraft.findFirst({ where: { id, userId } });
    if (!draft) throw ApiError.notFound('Draft not found');
    return draft;
  }

  async upsert(
    userId: string,
    input: {
      id?: string;
      label?: string;
      step?: number;
      payload: Record<string, unknown>;
    },
  ) {
    const data = {
      label: input.label,
      step: input.step ?? 1,
      payload: input.payload as Prisma.InputJsonValue,
    };

    const draft = input.id
      ? await (async () => {
          const existing = await prisma.vendorOrderDraft.findFirst({
            where: { id: input.id, userId },
          });
          if (!existing) throw ApiError.notFound('Draft not found');
          return prisma.vendorOrderDraft.update({ where: { id: input.id }, data });
        })()
      : await prisma.vendorOrderDraft.create({
          data: { userId, ...data },
        });

    activityLogService.logAsync({
      action: ActivityAction.ORDER_DRAFT_SAVED,
      entityType: 'vendor_order_draft',
      entityId: draft.id,
      actorId: userId,
    });

    return draft;
  }

  async remove(userId: string, id: string) {
    await prisma.vendorOrderDraft.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }
}

export const orderDraftsService = new OrderDraftsService();
