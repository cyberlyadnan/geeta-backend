import { prisma } from '../../config/database.js';
import type { CreateRetailCustomerInput } from './retail-customer.validation.js';

/** Narrow slice of the Prisma client this service needs — injectable so tests can pass a plain
 *  fake instead of monkey-patching the real (proxy-based) Prisma client. */
export type RetailCustomerDb = { retailCustomer: (typeof prisma)['retailCustomer'] };

export class RetailCustomerService {
  constructor(private readonly db: RetailCustomerDb = prisma) {}

  /** Dedup key is phone — looked up before every inline creation so a walk-in customer is
   *  reused across orders instead of duplicated. */
  async lookupByPhone(phone: string) {
    return this.db.retailCustomer.findFirst({
      where: { phone: phone.trim() },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(input: CreateRetailCustomerInput, createdById: string) {
    return this.db.retailCustomer.create({
      data: {
        name: input.name.trim(),
        phone: input.phone.trim(),
        hasGst: input.hasGst ?? false,
        gstNumber: input.hasGst ? (input.gstNumber?.trim() ?? null) : null,
        createdById,
      },
    });
  }

  /** Used by admin-created-order flow — reuses an existing customer for this phone if one
   *  exists, otherwise creates it inline. Never creates a duplicate for the same phone. */
  async findOrCreate(input: CreateRetailCustomerInput, createdById: string) {
    const existing = await this.lookupByPhone(input.phone);
    if (existing) return existing;
    return this.create(input, createdById);
  }
}

export const retailCustomerService = new RetailCustomerService();
