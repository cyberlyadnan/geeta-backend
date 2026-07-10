import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';

export interface NotificationListQuery {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
}

export class NotificationsService {
  async findForUser(userId: string, query: NotificationListQuery = {}) {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);

    const items = await prisma.userNotification.findMany({
      where: {
        userId,
        ...(query.unreadOnly ? { isRead: false } : {}),
      },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? page[page.length - 1]?.id : undefined;

    return {
      items: page.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        entityType: n.entityType,
        entityId: n.entityId,
        isRead: n.isRead,
        metadata: n.metadata,
        createdAt: n.createdAt.toISOString(),
      })),
      meta: { nextCursor, hasMore, limit },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.userNotification.count({
      where: { userId, isRead: false },
    });
  }

  async markRead(userId: string, notificationId: string) {
    const row = await prisma.userNotification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!row) throw ApiError.notFound('Notification not found');

    return prisma.userNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await prisma.userNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  async findById(userId: string, id: string) {
    const row = await prisma.userNotification.findFirst({
      where: { id, userId },
    });
    if (!row) throw ApiError.notFound('Notification not found');
    return row;
  }
}

export const notificationsService = new NotificationsService();
