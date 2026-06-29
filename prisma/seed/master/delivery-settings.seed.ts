import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

/** Platform delivery defaults — Indian commercial print market */
export async function seedDeliverySettings(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('delivery-settings');
  await ctx.prisma.deliverySettings.upsert({
    where: { id: 'default' },
    update: {
      defaultDeliveryCharge: 100,
      isDeliveryEnabled: true,
      isPickupEnabled: true,
      futureConfig: {
        mode: 'ASK_ON_EVERY_ORDER',
        flatRateEnabled: true,
        flatRateZones: [
          { name: 'Local (within city)', charge: 80, maxKm: 15 },
          { name: 'Metro', charge: 150, maxKm: 50 },
          { name: 'Outstation', charge: 250, maxKm: 500 },
        ],
        freeDeliveryAbove: null,
        pickupLocations: ['Factory Pickup — Main Plant'],
        courierProviders: ['Self Delivery', 'Blue Dart', 'Delhivery'],
      },
      updatedById: ctx.actorId,
    },
    create: {
      id: 'default',
      defaultDeliveryCharge: 100,
      isDeliveryEnabled: true,
      isPickupEnabled: true,
      futureConfig: {
        mode: 'ASK_ON_EVERY_ORDER',
        flatRateEnabled: true,
        pickupLocations: ['Factory Pickup — Main Plant'],
      },
      updatedById: ctx.actorId,
    },
  });
  log.info('Delivery settings upserted (default singleton)');
}
