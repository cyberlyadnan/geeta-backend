import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../logs/logger.js';
import { emitNotification } from '../../websocket/index.js';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface PendingNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
}

/**
 * Writes notifications durably and then actually pushes them.
 *
 * Before Phase 4 the socket emitter (`emitNotification`) existed but was called from nowhere:
 * `notifyUser` wrote a `UserNotification` row and stopped, so every "notification" in the system
 * was really just a row waiting to be polled. That is the emit-after-DB-write gap the
 * architecture review flagged, and the phase doc nominates the approval gates as the place to
 * close it properly.
 *
 * The rule this encodes: **persist inside the caller's transaction, emit only after it commits.**
 * Emitting inside the transaction would push a notification for work that might still roll back —
 * the user would see a proof-ready toast for a proof that was never saved. So `create` returns a
 * handle and `flush` does the pushing; callers run `flush` after their transaction resolves.
 */
export type NotificationEmitter = (
  userId: string,
  notification: { id: string; title: string; body: string; type: string },
) => void;

export class NotificationDispatchService {
  /**
   * The socket push is injected rather than imported directly so tests can assert a notification
   * was actually pushed. ESM re-exported bindings cannot be monkey-patched (`Cannot redefine
   * property`), so this is the only way to observe delivery — the same reason the Prisma-backed
   * services take an injectable `db`.
   */
  constructor(private readonly emit: NotificationEmitter = emitNotification) {}

  /**
   * Persists a notification. Pass the caller's `tx` so the row shares the fate of the work it
   * describes. Returns the payload to hand to `flush` once that transaction has committed.
   */
  async create(input: NotificationInput, tx?: Prisma.TransactionClient): Promise<PendingNotification> {
    const db = tx ?? prisma;
    const row = await db.userNotification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ?? {},
      },
      select: { id: true, userId: true, type: true, title: true, body: true },
    });

    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body ?? '',
    };
  }

  /**
   * Pushes already-persisted notifications over the socket. Call after the transaction commits.
   *
   * Delivery is best-effort by design: the durable row is already written, so a socket failure
   * (no server in a worker/test process, a disconnected client) must never surface as an error to
   * the caller — it only means the user sees it on next load instead of instantly.
   */
  flush(notifications: PendingNotification[]): void {
    for (const notification of notifications) {
      try {
        this.emit(notification.userId, {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          type: notification.type,
        });
      } catch (error) {
        logger.debug('Notification persisted but not pushed live', {
          notificationId: notification.id,
          userId: notification.userId,
          error,
        });
      }
    }
  }

  /** Convenience for callers with no transaction of their own: write and push immediately. */
  async send(input: NotificationInput): Promise<PendingNotification> {
    const pending = await this.create(input);
    this.flush([pending]);
    return pending;
  }
}

export const notificationDispatchService = new NotificationDispatchService();
