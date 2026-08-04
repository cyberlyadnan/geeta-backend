import {
  FinancialActorType,
  FinancialEventDirection,
  FinancialEventType,
  FinancialInstrument,
  FinancialReferenceType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';

export interface RecordFinancialEventInput {
  actorType: FinancialActorType;
  actorId: string;
  eventType: FinancialEventType;
  amount: number | Prisma.Decimal;
  direction: FinancialEventDirection;
  instrument: FinancialInstrument;
  referenceType: FinancialReferenceType;
  referenceId: string;
  createdByUserId?: string | null;
}

export interface ListFinancialEventsQuery {
  actorId?: string;
  actorType?: FinancialActorType;
  eventType?: FinancialEventType;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

/** Narrow slice of the Prisma client the read side needs — injectable so tests can drive it
 *  with a hand-rolled fake instead of monkey-patching the real (proxy-based) Prisma client,
 *  which node:test's mock.method cannot patch (see retail-customer.service tests). */
export type FinancialEventDb = Pick<typeof prisma, 'financialEvent' | 'user' | 'retailCustomer'>;

/**
 * Append-only ledger writer + reader. The write side is called from inside the same
 * transaction as the balance mutation it documents (wallet-ledger.service.ts,
 * credit-ledger.service.ts) — this class never opens its own transaction for `record`,
 * so a caller forgetting to pass `tx` would silently write outside the atomic boundary.
 */
export class FinancialEventService {
  constructor(private readonly db: FinancialEventDb = prisma) {}

  async record(input: RecordFinancialEventInput, tx: Prisma.TransactionClient) {
    return tx.financialEvent.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        eventType: input.eventType,
        amount: toDecimal(input.amount),
        direction: input.direction,
        instrument: input.instrument,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  async list(query: ListFinancialEventsQuery) {
    const { page, limit, actorId, actorType, eventType, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.FinancialEventWhereInput = {
      ...(actorId && { actorId }),
      ...(actorType && { actorType }),
      ...(eventType && { eventType }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
    };

    const [events, total] = await Promise.all([
      this.db.financialEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.financialEvent.count({ where }),
    ]);

    const actorNames = await this.resolveActorNames(events.map((e) => ({ actorType: e.actorType, actorId: e.actorId })));

    return {
      data: events.map((event) => ({
        id: event.id,
        actorType: event.actorType,
        actorId: event.actorId,
        actorName: actorNames.get(`${event.actorType}:${event.actorId}`) ?? null,
        eventType: event.eventType,
        amount: decimalToNumber(event.amount),
        direction: event.direction,
        instrument: event.instrument,
        referenceType: event.referenceType,
        referenceId: event.referenceId,
        createdByUserId: event.createdByUserId,
        createdAt: event.createdAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async resolveActorNames(actors: Array<{ actorType: FinancialActorType; actorId: string }>) {
    const vendorIds = [...new Set(actors.filter((a) => a.actorType === 'VENDOR').map((a) => a.actorId))];
    const retailIds = [...new Set(actors.filter((a) => a.actorType === 'RETAIL_CUSTOMER').map((a) => a.actorId))];

    const [vendors, retailCustomers] = await Promise.all([
      vendorIds.length
        ? this.db.user.findMany({
            where: { id: { in: vendorIds } },
            select: { id: true, firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } },
          })
        : Promise.resolve([]),
      retailIds.length
        ? this.db.retailCustomer.findMany({ where: { id: { in: retailIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const names = new Map<string, string>();
    for (const vendor of vendors) {
      names.set(`VENDOR:${vendor.id}`, vendor.vendorProfile?.businessName ?? `${vendor.firstName} ${vendor.lastName}`);
    }
    for (const retail of retailCustomers) {
      names.set(`RETAIL_CUSTOMER:${retail.id}`, retail.name);
    }
    return names;
  }
}

export const financialEventService = new FinancialEventService();
