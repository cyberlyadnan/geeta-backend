import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShiftAssignmentService,
  selectShiftFor,
  parseCutoffMinutes,
  type ShiftAssignmentDb,
  type ShiftLike,
} from '../shift-assignment.service.js';

/** The client's configured windows, used throughout: 11am / 2pm / 4pm / 7pm. */
const SHIFTS: ShiftLike[] = [
  { id: 'shift-11', label: '11:00 AM', cutoffTime: '11:00' },
  { id: 'shift-14', label: '2:00 PM', cutoffTime: '14:00' },
  { id: 'shift-16', label: '4:00 PM', cutoffTime: '16:00' },
  { id: 'shift-19', label: '7:00 PM', cutoffTime: '19:00' },
];

function at(hours: number, minutes = 0): Date {
  return new Date(2026, 7, 4, hours, minutes, 0, 0); // 2026-08-04 local
}

describe('selectShiftFor — the client\'s worked example', () => {
  it('sends a 10:00am-ready order to the 11:00 shift', () => {
    const result = selectShiftFor(at(10), SHIFTS);
    assert.equal(result.shift.id, 'shift-11');
    assert.equal(result.dispatchDate, '2026-08-04');
    assert.equal(result.rolledToNextDay, false);
  });

  it('sends both a 12:00pm and a 1:00pm order to the same 2:00pm shift', () => {
    const noon = selectShiftFor(at(12), SHIFTS);
    const onePm = selectShiftFor(at(13), SHIFTS);

    assert.equal(noon.shift.id, 'shift-14');
    assert.equal(onePm.shift.id, 'shift-14');
    assert.equal(noon.dispatchDate, onePm.dispatchDate);
  });

  it('treats an order ready exactly on a cutoff as making that shift', () => {
    assert.equal(selectShiftFor(at(11), SHIFTS).shift.id, 'shift-11');
    assert.equal(selectShiftFor(at(11, 1), SHIFTS).shift.id, 'shift-14');
  });

  it('rolls past the last shift of the day to the first shift tomorrow', () => {
    const result = selectShiftFor(at(20), SHIFTS);
    assert.equal(result.shift.id, 'shift-11');
    assert.equal(result.dispatchDate, '2026-08-05');
    assert.equal(result.rolledToNextDay, true);
  });

  it('rolls across a month boundary correctly', () => {
    const lastDayOfAugust = new Date(2026, 7, 31, 21, 0, 0, 0);
    const result = selectShiftFor(lastDayOfAugust, SHIFTS);
    assert.equal(result.dispatchDate, '2026-09-01');
  });

  it('ignores malformed cutoffs rather than mis-sorting them', () => {
    const result = selectShiftFor(at(10), [
      { id: 'bad', label: 'broken', cutoffTime: 'not-a-time' },
      ...SHIFTS,
    ]);
    assert.equal(result.shift.id, 'shift-11');
  });

  it('rejects when no usable shift is configured', () => {
    assert.throws(() => selectShiftFor(at(10), []), /No active delivery shifts/);
  });

  it('sorts by cutoff time, not by the order rows arrive in', () => {
    const shuffled = [SHIFTS[3]!, SHIFTS[1]!, SHIFTS[0]!, SHIFTS[2]!];
    assert.equal(selectShiftFor(at(10), shuffled).shift.id, 'shift-11');
    assert.equal(selectShiftFor(at(15), shuffled).shift.id, 'shift-16');
  });
});

describe('parseCutoffMinutes', () => {
  it('parses valid times and rejects nonsense', () => {
    assert.equal(parseCutoffMinutes('11:00'), 660);
    assert.equal(parseCutoffMinutes('9:30'), 570);
    assert.equal(parseCutoffMinutes('00:00'), 0);
    assert.equal(parseCutoffMinutes('23:59'), 1439);
    assert.equal(parseCutoffMinutes('24:00'), null);
    assert.equal(parseCutoffMinutes('11:60'), null);
    assert.equal(parseCutoffMinutes('11'), null);
    assert.equal(parseCutoffMinutes(''), null);
  });
});

/** Hand-rolled fake — node:test's mock.method cannot patch Prisma's proxy-based model
 *  delegates (see retail-customer.service tests), so the service takes an injectable db. */
function createFakeDb() {
  const batches: Array<Record<string, unknown>> = [];
  const batchOrders: Array<{ id: string; dispatchBatchId: string; orderId: string }> = [];

  const findBatch = (where: Record<string, unknown>) => {
    const key =
      (where.vendorId_shiftId_dispatchDate as Record<string, string> | undefined) ??
      (where.retailCustomerId_shiftId_dispatchDate as Record<string, string> | undefined);
    if (!key) return null;
    return (
      batches.find((b) =>
        Object.entries(key).every(([field, value]) => b[field] === value),
      ) ?? null
    );
  };

  const tx = {
    deliveryShift: {
      findMany: async () => SHIFTS.map((s) => ({ ...s, sortOrder: 0, isActive: true })),
    },
    dispatchBatch: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => findBatch(where),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const batch = { id: `batch-${batches.length + 1}`, ...data };
        batches.push(batch);
        return batch;
      },
    },
    dispatchBatchOrder: {
      findUnique: async ({ where }: { where: { orderId: string } }) => {
        const link = batchOrders.find((bo) => bo.orderId === where.orderId);
        if (!link) return null;
        return {
          ...link,
          dispatchBatch: batches.find((b) => b.id === link.dispatchBatchId)!,
        };
      },
      create: async ({ data }: { data: { dispatchBatchId: string; orderId: string } }) => {
        const link = { id: `bo-${batchOrders.length + 1}`, ...data };
        batchOrders.push(link);
        return link;
      },
    },
  };

  const db: ShiftAssignmentDb = {
    $transaction: (async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx)) as ShiftAssignmentDb['$transaction'],
  } as ShiftAssignmentDb;

  return { db, batches, batchOrders };
}

describe('ShiftAssignmentService.assignToShift — batching, not one-batch-per-order', () => {
  it('puts the 12pm and 1pm orders from the same vendor in ONE 2pm batch', async () => {
    const { db, batches, batchOrders } = createFakeDb();
    const service = new ShiftAssignmentService(db);
    const vendor = { type: 'vendor' as const, vendorId: 'vendor-1' };

    const first = await service.assignToShift('order-noon', vendor, at(12));
    const second = await service.assignToShift('order-1pm', vendor, at(13));

    assert.equal(first.created, true, 'first order opens the batch');
    assert.equal(second.created, false, 'second order joins the existing batch');
    assert.equal(first.batch.id, second.batch.id);
    assert.equal(batches.length, 1, 'exactly one batch was created, not one per order');
    assert.equal(batchOrders.length, 2, 'both orders are linked to it');
    assert.equal(batches[0]!.shiftId, 'shift-14');
  });

  it('keeps the 10am order separate from the 12pm one — different shifts', async () => {
    const { db, batches } = createFakeDb();
    const service = new ShiftAssignmentService(db);
    const vendor = { type: 'vendor' as const, vendorId: 'vendor-1' };

    const morning = await service.assignToShift('order-10am', vendor, at(10));
    const noon = await service.assignToShift('order-noon', vendor, at(12));

    assert.notEqual(morning.batch.id, noon.batch.id);
    assert.equal(batches.length, 2);
    assert.equal(morning.batch.shiftId, 'shift-11');
    assert.equal(noon.batch.shiftId, 'shift-14');
  });

  it('keeps two different vendors in the same shift in separate batches', async () => {
    const { db, batches } = createFakeDb();
    const service = new ShiftAssignmentService(db);

    const a = await service.assignToShift('order-a', { type: 'vendor', vendorId: 'vendor-1' }, at(12));
    const b = await service.assignToShift('order-b', { type: 'vendor', vendorId: 'vendor-2' }, at(12));

    assert.notEqual(a.batch.id, b.batch.id);
    assert.equal(batches.length, 2, 'batches are per vendor, not per shift');
  });

  it('batches retail customers on the same rules as vendors', async () => {
    const { db, batches, batchOrders } = createFakeDb();
    const service = new ShiftAssignmentService(db);
    const retail = { type: 'retail' as const, retailCustomerId: 'retail-1' };

    const first = await service.assignToShift('order-1', retail, at(12));
    const second = await service.assignToShift('order-2', retail, at(13));

    assert.equal(first.batch.id, second.batch.id);
    assert.equal(batches.length, 1);
    assert.equal(batches[0]!.retailCustomerId, 'retail-1');
    assert.equal(batches[0]!.vendorId, undefined, 'retail batches carry no vendorId');
    assert.equal(batchOrders.length, 2);
  });

  it('is idempotent — re-assigning an order does not move or duplicate it', async () => {
    const { db, batches, batchOrders } = createFakeDb();
    const service = new ShiftAssignmentService(db);
    const vendor = { type: 'vendor' as const, vendorId: 'vendor-1' };

    const first = await service.assignToShift('order-1', vendor, at(12));
    const repeat = await service.assignToShift('order-1', vendor, at(15));

    assert.equal(repeat.alreadyAssigned, true);
    assert.equal(repeat.batch.id, first.batch.id, 'a later retry must not move it to a later shift');
    assert.equal(batches.length, 1);
    assert.equal(batchOrders.length, 1, 'no duplicate link row');
  });

  it('starts a new batch rather than joining one that has already been billed', async () => {
    const { db, batches } = createFakeDb();
    const service = new ShiftAssignmentService(db);
    const vendor = { type: 'vendor' as const, vendorId: 'vendor-1' };

    const first = await service.assignToShift('order-1', vendor, at(12));
    batches[0]!.status = 'READY'; // dispatcher billed it; invoice issued

    const late = await service.assignToShift('order-2', vendor, at(13));

    assert.notEqual(late.batch.id, first.batch.id);
    assert.equal(late.batch.shiftId, 'shift-16', 'rolls to the next shift, not into the invoiced batch');
  });

  it('rolls a late order into tomorrow\'s first batch', async () => {
    const { db, batches } = createFakeDb();
    const service = new ShiftAssignmentService(db);

    const result = await service.assignToShift(
      'order-late',
      { type: 'vendor', vendorId: 'vendor-1' },
      at(21),
    );

    assert.equal(result.batch.shiftId, 'shift-11');
    assert.equal(batches[0]!.dispatchDate, '2026-08-05');
  });
});
