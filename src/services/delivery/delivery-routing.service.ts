import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Which delivery service carries a given vendor's goods.
 *
 * This is the routing rule the whole department turns on, and it is deliberately the simplest one
 * that could work: the vendor is tagged with the service they use, and every consignment for them
 * takes it. No question at order time, no dispatcher decision in the normal case, and nothing to
 * re-route when a delivery person is away — because the consignment is routed to a *service*, and
 * the people are tagged to the service separately.
 *
 * A vendor may hold several services (a shop that takes local runs on weekdays and the bus on
 * Saturdays); exactly one of those rows is the default, and that is the one used. The dispatcher
 * can still switch a particular consignment before releasing it.
 *
 * Note what is deliberately *not* done: the service is never stamped onto a batch when the batch
 * is opened. `DispatchBatch.deliveryServiceId` means "a dispatcher overrode this one", and null
 * means "follow the vendor". So re-tagging a vendor this morning takes effect on batches that
 * were opened yesterday and have not left yet — which is what an admin who just fixed a tag
 * expects — and there are no stamped copies to go stale.
 */
export class DeliveryRoutingService {
  /**
   * The service a vendor's consignments take, or null when they have not been tagged.
   *
   * Null is a legitimate answer, not an error: a vendor onboarded before this module existed has
   * no tags, and their consignment must still dispatch. It simply lands in the unrouted tray for
   * an admin to place, rather than blocking the dispatcher at the counter.
   */
  async resolveForVendorUser(vendorUserId: string, db: Db = prisma): Promise<string | null> {
    const rows = await db.vendorDeliveryService.findMany({
      where: { vendorProfile: { userId: vendorUserId }, deliveryService: { isActive: true } },
      select: { deliveryServiceId: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      take: 2,
    });

    // `orderBy isDefault desc` puts the default first; falling through to the first tagged service
    // means a vendor tagged with exactly one service needs no default flag set to work.
    return rows[0]?.deliveryServiceId ?? null;
  }

  /** Same question for a whole set of vendors, in one query — used when listing batches. */
  async resolveForVendorUsers(
    vendorUserIds: string[],
    db: Db = prisma,
  ): Promise<Map<string, string>> {
    if (vendorUserIds.length === 0) return new Map();

    const rows = await db.vendorDeliveryService.findMany({
      where: {
        vendorProfile: { userId: { in: vendorUserIds } },
        deliveryService: { isActive: true },
      },
      select: {
        deliveryServiceId: true,
        isDefault: true,
        vendorProfile: { select: { userId: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    const resolved = new Map<string, string>();
    for (const row of rows) {
      // First row per vendor wins, and the ordering above guarantees that is their default.
      if (!resolved.has(row.vendorProfile.userId)) {
        resolved.set(row.vendorProfile.userId, row.deliveryServiceId);
      }
    }
    return resolved;
  }

  /** The tagged services for one vendor, for the admin vendor form. */
  async listForVendorProfile(vendorProfileId: string) {
    return prisma.vendorDeliveryService.findMany({
      where: { vendorProfileId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        deliveryService: {
          select: { id: true, code: true, name: true, kind: true, colorHex: true, isActive: true },
        },
      },
    });
  }

  /**
   * Replaces a vendor's tags in one transaction.
   *
   * Whole-set replacement rather than add/remove endpoints: the admin edits a vendor form and
   * saves it, and a diff computed on the server cannot leave the vendor tagged with something the
   * admin thought they had removed. Exactly one row is marked default, chosen explicitly or
   * falling back to the first — a vendor with tags but no default would route nowhere.
   */
  async setForVendorProfile(
    vendorProfileId: string,
    serviceIds: string[],
    defaultServiceId: string | null,
    db: Db = prisma,
  ): Promise<void> {
    const unique = [...new Set(serviceIds)];
    const chosenDefault =
      defaultServiceId && unique.includes(defaultServiceId) ? defaultServiceId : unique[0] ?? null;

    await db.vendorDeliveryService.deleteMany({
      where: { vendorProfileId, deliveryServiceId: { notIn: unique.length > 0 ? unique : [''] } },
    });

    for (const serviceId of unique) {
      await db.vendorDeliveryService.upsert({
        where: { vendorProfileId_deliveryServiceId: { vendorProfileId, deliveryServiceId: serviceId } },
        create: {
          vendorProfileId,
          deliveryServiceId: serviceId,
          isDefault: serviceId === chosenDefault,
        },
        update: { isDefault: serviceId === chosenDefault },
      });
    }
  }
}

export const deliveryRoutingService = new DeliveryRoutingService();
