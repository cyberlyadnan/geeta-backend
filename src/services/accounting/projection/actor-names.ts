import type { FinancialActorType } from '@prisma/client';
import { prisma } from '../../../config/database.js';

/**
 * Resolves the display name for the polymorphic (actorType, actorId) pair the financial ledger
 * uses. Names are snapshotted onto the journal entry so a party statement stays readable even if
 * the vendor profile is later renamed or deleted.
 */
export async function resolveActorNames(
  actors: { actorType: FinancialActorType; actorId: string }[],
): Promise<Map<string, string>> {
  const vendorIds = [...new Set(actors.filter((a) => a.actorType === 'VENDOR').map((a) => a.actorId))];
  const retailIds = [...new Set(actors.filter((a) => a.actorType === 'RETAIL_CUSTOMER').map((a) => a.actorId))];

  const [vendors, retail] = await Promise.all([
    vendorIds.length
      ? prisma.user.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true, firstName: true, lastName: true, vendorProfile: { select: { businessName: true } } },
        })
      : Promise.resolve([]),
    retailIds.length
      ? prisma.retailCustomer.findMany({ where: { id: { in: retailIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const names = new Map<string, string>();
  for (const v of vendors) {
    names.set(`VENDOR:${v.id}`, v.vendorProfile?.businessName ?? `${v.firstName} ${v.lastName}`);
  }
  for (const r of retail) names.set(`RETAIL_CUSTOMER:${r.id}`, r.name);
  return names;
}
