import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';

/** Narrow slice of the Prisma client this service needs — injectable so tests can drive the
 *  whole flow with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma
 *  client, which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type ShiftAssignmentDb = Pick<
  typeof prisma,
  'deliveryShift' | 'dispatchBatch' | 'dispatchBatchOrder' | '$transaction'
>;

export interface ShiftLike {
  id: string;
  label: string;
  cutoffTime: string;
}

/** The actor a batch belongs to — mirrors orders.service.ts's OrderActor shape. */
export type DispatchActor =
  | { type: 'vendor'; vendorId: string }
  | { type: 'retail'; retailCustomerId: string };

/** "HH:mm" → minutes since midnight. Returns null for anything malformed. */
export function parseCutoffMinutes(cutoffTime: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(cutoffTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export interface ShiftSelection {
  shift: ShiftLike;
  /** Local calendar day the batch dispatches on, "YYYY-MM-DD". */
  dispatchDate: string;
  /** True when every shift for today had already passed and the order rolled to tomorrow. */
  rolledToNextDay: boolean;
}

/**
 * Picks the dispatch window for an order that just became ready.
 *
 * The first shift whose cutoff has not yet passed wins; if every shift today is past, the order
 * rolls to the first shift tomorrow. Cutoffs are compared as minutes-since-midnight in server
 * local time, so this is a pure function of (now, shifts) and can be tested against the client's
 * worked example without touching the clock.
 *
 * Worked example (shifts 11:00 / 14:00 / 16:00 / 19:00):
 *   ready 10:00 → 11:00 shift
 *   ready 12:00 → 14:00 shift
 *   ready 13:00 → 14:00 shift   (same batch as the 12:00 order, same vendor + day)
 *   ready 20:00 → 11:00 shift tomorrow
 */
export function selectShiftFor(now: Date, shifts: ShiftLike[]): ShiftSelection {
  const ordered = shifts
    .map((shift) => ({ shift, minutes: parseCutoffMinutes(shift.cutoffTime) }))
    .filter((entry): entry is { shift: ShiftLike; minutes: number } => entry.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);

  if (ordered.length === 0) {
    throw ApiError.badRequest(
      'No active delivery shifts are configured — add at least one before dispatching orders',
    );
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayMatch = ordered.find((entry) => entry.minutes >= nowMinutes);

  if (todayMatch) {
    return { shift: todayMatch.shift, dispatchDate: localDateKey(now), rolledToNextDay: false };
  }

  return {
    shift: ordered[0]!.shift,
    dispatchDate: localDateKey(addDays(now, 1)),
    rolledToNextDay: true,
  };
}

export class ShiftAssignmentService {
  constructor(private readonly db: ShiftAssignmentDb = prisma) {}

  /**
   * Assigns an order to its dispatch batch, creating the batch if this is the first order for
   * that (actor, shift, day). Idempotent: an order already in a batch is returned unchanged
   * rather than moved or duplicated, so a retried status transition cannot split a batch.
   */
  async assignToShift(
    orderId: string,
    actor: DispatchActor,
    now: Date = new Date(),
    existingTx?: Prisma.TransactionClient,
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.dispatchBatchOrder.findUnique({
        where: { orderId },
        include: { dispatchBatch: true },
      });
      if (existing) {
        return { batch: existing.dispatchBatch, created: false, alreadyAssigned: true };
      }

      const shifts = await tx.deliveryShift.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { cutoffTime: 'asc' }],
      });
      const selection = selectShiftFor(now, shifts);

      const where =
        actor.type === 'vendor'
          ? {
              vendorId_shiftId_dispatchDate: {
                vendorId: actor.vendorId,
                shiftId: selection.shift.id,
                dispatchDate: selection.dispatchDate,
              },
            }
          : {
              retailCustomerId_shiftId_dispatchDate: {
                retailCustomerId: actor.retailCustomerId,
                shiftId: selection.shift.id,
                dispatchDate: selection.dispatchDate,
              },
            };

      const existingBatch = await tx.dispatchBatch.findUnique({ where });

      // Only an open batch may absorb new orders — once a batch has been billed or dispatched
      // its invoice is issued, so a late order starts a fresh batch on the next shift instead
      // of silently joining something already invoiced.
      const openBatch =
        existingBatch && existingBatch.status === 'AWAITING_READY' ? existingBatch : null;

      let batch = openBatch;
      let created = false;

      if (!batch) {
        if (existingBatch) {
          const nextSelection = this.nextShiftAfter(selection, shifts);
          batch = await this.createBatch(tx, actor, nextSelection);
        } else {
          batch = await this.createBatch(tx, actor, selection);
        }
        created = true;
      }

      await tx.dispatchBatchOrder.create({
        data: { dispatchBatchId: batch.id, orderId },
      });

      return { batch, created, alreadyAssigned: false };
    };

    if (existingTx) return run(existingTx);
    return this.db.$transaction(run);
  }

  /** Rolls to the following shift when the natural one is already billed/dispatched. */
  nextShiftAfter(selection: ShiftSelection, shifts: ShiftLike[]): ShiftSelection {
    const ordered = shifts
      .map((shift) => ({ shift, minutes: parseCutoffMinutes(shift.cutoffTime) }))
      .filter((entry): entry is { shift: ShiftLike; minutes: number } => entry.minutes !== null)
      .sort((a, b) => a.minutes - b.minutes);

    const currentIndex = ordered.findIndex((entry) => entry.shift.id === selection.shift.id);
    const next = ordered[currentIndex + 1];
    if (next) {
      return { shift: next.shift, dispatchDate: selection.dispatchDate, rolledToNextDay: false };
    }
    return {
      shift: ordered[0]!.shift,
      dispatchDate: localDateKey(addDays(new Date(`${selection.dispatchDate}T00:00:00`), 1)),
      rolledToNextDay: true,
    };
  }

  private async createBatch(
    tx: Prisma.TransactionClient,
    actor: DispatchActor,
    selection: ShiftSelection,
  ) {
    return tx.dispatchBatch.create({
      data: {
        ...(actor.type === 'vendor'
          ? { vendorId: actor.vendorId }
          : { retailCustomerId: actor.retailCustomerId }),
        shiftId: selection.shift.id,
        dispatchDate: selection.dispatchDate,
        status: 'AWAITING_READY',
      },
    });
  }
}

export const shiftAssignmentService = new ShiftAssignmentService();
