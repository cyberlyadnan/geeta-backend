import { ProductionOrderStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { supportSettingsService } from './support-settings.service.js';
import { evaluateReprintWindow } from './reprint-window.js';

/** Statuses that mean the job physically left the building. */
const DISPATCHED_STATUSES: ProductionOrderStatus[] = [
  ProductionOrderStatus.DISPATCHED,
  ProductionOrderStatus.DELIVERED,
];

export type ReprintIneligibleReason =
  | 'ORDER_NOT_FOUND'
  | 'NOT_YOUR_ORDER'
  | 'NOT_DISPATCHED'
  | 'WINDOW_EXPIRED'
  | 'ORDER_CANCELLED'
  | 'ALREADY_REQUESTED'
  | 'ALREADY_REPRINTED';

export interface ReprintEligibility {
  eligible: boolean;
  reason: ReprintIneligibleReason | null;
  /** Sentence shown to the vendor. Always states the rule, never just "not allowed". */
  message: string;
  order: {
    id: string;
    orderNumber: string;
    orderName: string | null;
    status: ProductionOrderStatus;
    quantity: number;
    totalAmount: number;
    dispatchedAt: string | null;
    deliveredAt: string | null;
  } | null;
  window: {
    days: number;
    requiresDispatch: boolean;
    daysSinceDispatch: number | null;
    /** Days the vendor has left. Negative once the window has closed. */
    daysRemaining: number | null;
    lastDateToRaise: string | null;
  };
  /** An open ticket already covering this order, if any. */
  existingTicket: { id: string; ticketNumber: string; status: string } | null;
}

/**
 * Decides whether a vendor may still ask for a reprint on an order — and, just as importantly,
 * explains why not when the answer is no.
 *
 * The rule itself is simple (dispatched, and within N days) but three things make it worth its
 * own service:
 *
 *  1. **N is a runtime setting.** The admin moves the window; the code must not know its value.
 *  2. **The answer is snapshotted onto the ticket.** Once a request is accepted, later changes to
 *     the window must not retroactively invalidate it — so the numbers this returns are stored
 *     with the ticket rather than recomputed when someone opens it.
 *  3. **The vendor sees this before typing anything.** The reprint page calls it on order-number
 *     entry, so a vendor who is out of time is told immediately, with the date they missed and
 *     the phone number to call — instead of filling a form that gets rejected.
 */
export class ReprintEligibilityService {
  async check(orderId: string, vendorUserId: string | null): Promise<ReprintEligibility> {
    const settings = await supportSettingsService.get();
    const windowDays = settings.reprintWindowDays;
    const requiresDispatch = settings.reprintRequiresDispatch;

    const emptyWindow = {
      days: windowDays,
      requiresDispatch,
      daysSinceDispatch: null,
      daysRemaining: null,
      lastDateToRaise: null,
    };

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        orderName: true,
        status: true,
        customerId: true,
        totalAmount: true,
        createdAt: true,
        updatedAt: true,
        items: { select: { quantity: true } },
        dispatchBatchOrder: {
          select: { dispatchBatch: { select: { dispatchedAt: true, status: true } } },
        },
      },
    });

    if (!order) {
      return {
        eligible: false,
        reason: 'ORDER_NOT_FOUND',
        message: 'We could not find that order number. Please check it and try again.',
        order: null,
        window: emptyWindow,
        existingTicket: null,
      };
    }

    if (vendorUserId && order.customerId !== vendorUserId) {
      // Deliberately the same wording as "not found" — a vendor probing order numbers should not
      // be able to tell which ones exist.
      return {
        eligible: false,
        reason: 'NOT_YOUR_ORDER',
        message: 'We could not find that order number. Please check it and try again.',
        order: null,
        window: emptyWindow,
        existingTicket: null,
      };
    }

    const dispatchedAt = order.dispatchBatchOrder?.dispatchBatch.dispatchedAt ?? null;
    const isDispatched = DISPATCHED_STATUSES.includes(order.status) || dispatchedAt !== null;
    // Fall back to the order's own last movement when the batch never stamped a dispatch time.
    const effectiveDispatchDate = dispatchedAt ?? (isDispatched ? order.updatedAt : null);

    const orderDto = {
      id: order.id,
      orderNumber: order.orderNumber,
      orderName: order.orderName,
      status: order.status,
      quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: order.totalAmount.toNumber(),
      dispatchedAt: dispatchedAt?.toISOString() ?? null,
      deliveredAt: order.status === ProductionOrderStatus.DELIVERED ? order.updatedAt.toISOString() : null,
    };

    const existing = await prisma.supportTicket.findFirst({
      where: {
        orderId: order.id,
        type: 'REPRINT',
        status: { in: ['OPEN', 'UNDER_REVIEW', 'AWAITING_CUSTOMER', 'APPROVED'] },
      },
      select: { id: true, ticketNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    if (order.status === ProductionOrderStatus.CANCELLED) {
      return {
        eligible: false,
        reason: 'ORDER_CANCELLED',
        message: 'This order was cancelled, so there is nothing to reprint.',
        order: orderDto,
        window: emptyWindow,
        existingTicket: existing,
      };
    }

    if (existing) {
      return {
        eligible: false,
        reason: 'ALREADY_REQUESTED',
        message: `A reprint request for this order is already open (${existing.ticketNumber}). We will update you there.`,
        order: orderDto,
        window: emptyWindow,
        existingTicket: existing,
      };
    }

    if (requiresDispatch && !isDispatched) {
      return {
        eligible: false,
        reason: 'NOT_DISPATCHED',
        message:
          'This order has not been dispatched yet, so a reprint cannot be raised. If something is wrong with it, raise a complaint instead and we will fix it before it ships.',
        order: orderDto,
        window: { ...emptyWindow },
        existingTicket: null,
      };
    }

    const reference = effectiveDispatchDate ?? order.createdAt;
    const { expired, ...window } = evaluateReprintWindow({
      reference,
      now: new Date(),
      windowDays,
      requiresDispatch,
    });
    const daysSince = window.daysSinceDispatch;
    const daysRemaining = window.daysRemaining;
    const lastDate = new Date(window.lastDateToRaise);

    if (expired) {
      return {
        eligible: false,
        reason: 'WINDOW_EXPIRED',
        message: `Reprints can be requested within ${String(windowDays)} days of dispatch. This order was dispatched ${String(daysSince)} days ago, so the window closed on ${lastDate.toISOString().slice(0, 10)}. Please call us and we will see what can be done.`,
        order: orderDto,
        window,
        existingTicket: null,
      };
    }

    return {
      eligible: true,
      reason: null,
      message:
        daysRemaining <= 2
          ? `You have ${String(Math.max(0, daysRemaining))} day(s) left to request a reprint on this order.`
          : `This order is eligible for a reprint. You have ${String(daysRemaining)} days left.`,
      order: orderDto,
      window,
      existingTicket: null,
    };
  }

  /** Looks an order up by the number the vendor typed, then runs the same check. */
  async checkByOrderNumber(orderNumber: string, vendorUserId: string | null): Promise<ReprintEligibility> {
    const order = await prisma.productionOrder.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      select: { id: true },
    });
    if (!order) {
      const settings = await supportSettingsService.get();
      return {
        eligible: false,
        reason: 'ORDER_NOT_FOUND',
        message: 'We could not find that order number. Please check it and try again.',
        order: null,
        window: {
          days: settings.reprintWindowDays,
          requiresDispatch: settings.reprintRequiresDispatch,
          daysSinceDispatch: null,
          daysRemaining: null,
          lastDateToRaise: null,
        },
        existingTicket: null,
      };
    }
    return this.check(order.id, vendorUserId);
  }
}

export const reprintEligibilityService = new ReprintEligibilityService();
