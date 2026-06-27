import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';

export async function recordOrderEvent(
  orderId: string,
  event: {
    eventType: string;
    title: string;
    description?: string;
    metadata?: Prisma.InputJsonValue;
    actorId?: string;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  return db.productionOrderEvent.create({
    data: {
      orderId,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      metadata: event.metadata ?? {},
      actorId: event.actorId,
    },
  });
}

export async function notifyUser(
  userId: string,
  notification: {
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? prisma;
  return db.userNotification.create({
    data: {
      userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      entityType: notification.entityType,
      entityId: notification.entityId,
      metadata: notification.metadata ?? {},
    },
  });
}
