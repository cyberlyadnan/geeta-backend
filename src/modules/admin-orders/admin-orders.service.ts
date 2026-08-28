import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { ordersService, type OrderActor } from '../orders/orders.service.js';
import { retailCustomerService, type RetailCustomerService } from '../admin-retail-customers/retail-customer.service.js';
import type { ActingAs, AdminCreateOrderInput, AdminOrderPreviewInput } from './admin-orders.validation.js';

/** Narrow slice of the Prisma client — injectable for the same reason as OrderAmendmentDb /
 *  RetailCustomerDb: node:test's mock.method cannot patch Prisma's proxy-based delegates. */
export type AdminOrdersDb = Pick<typeof prisma, 'user'>;

export async function resolveActor(
  actingAs: ActingAs,
  staffUserId: string,
  deps: { db?: AdminOrdersDb; retailCustomers?: RetailCustomerService } = {},
): Promise<OrderActor> {
  const db = deps.db ?? prisma;
  const retailCustomers = deps.retailCustomers ?? retailCustomerService;

  if (actingAs.type === 'vendor') {
    const vendor = await db.user.findFirst({
      where: { id: actingAs.vendorId, deletedAt: null },
      select: { id: true, vendorProfile: { select: { id: true } } },
    });
    if (!vendor?.vendorProfile) throw ApiError.notFound('Vendor not found');
    return { type: 'vendor', vendorUserId: vendor.id };
  }

  const customer = await retailCustomers.findOrCreate(
    {
      name: actingAs.name,
      phone: actingAs.phone,
      hasGst: actingAs.hasGst,
      gstNumber: actingAs.gstNumber,
    },
    staffUserId,
  );
  return { type: 'retail', retailCustomerId: customer.id };
}

/**
 * Admin/manager order entry — thin wrapper over the SAME order preview/create pipeline the
 * vendor wizard uses. The only addition is resolving who the order is for (existing vendor, or
 * a retail customer looked up/created by phone) before delegating.
 */
export class AdminOrdersService {
  async preview(staffUserId: string, input: AdminOrderPreviewInput) {
    const { actingAs, ...rest } = input;
    const actor = await resolveActor(actingAs, staffUserId);
    return ordersService.preview(actor, rest, staffUserId);
  }

  async create(staffUserId: string, input: AdminCreateOrderInput) {
    const { actingAs, ...rest } = input;
    const actor = await resolveActor(actingAs, staffUserId);
    return ordersService.create(actor, rest, staffUserId);
  }
}

export const adminOrdersService = new AdminOrdersService();
