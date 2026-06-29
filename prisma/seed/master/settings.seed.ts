import type { SeedContext } from '../core/types.js';
import { createSeedLogger } from '../core/logger.js';

/**
 * Global ERP settings stored on DeliverySettings.futureConfig.platform
 * until a dedicated SystemSettings model is introduced.
 */
export const PLATFORM_SETTINGS = {
  currency: 'INR',
  currencySymbol: '₹',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  gstRate: 0.18,
  gstLabel: 'GST 18%',
  orderPrefix: 'GP-ORD',
  invoicePrefix: 'GP-INV',
  quotePrefix: 'GP-QTE',
  defaultMeasurementUnit: 'MM',
  defaultAreaUnit: 'SQFT',
  maxUploadSizeMb: 200,
  defaultFileTypes: ['PDF', 'AI', 'PSD', 'PNG', 'JPG', 'JPEG', 'CDR', 'EPS'],
  companyName: 'Geeta Print',
  seedVersion: '1.0.0',
  pricingStrategiesRegistered: true,
} as const;

export async function seedPlatformSettings(ctx: SeedContext): Promise<void> {
  const log = createSeedLogger('settings');
  const existing = await ctx.prisma.deliverySettings.findUnique({ where: { id: 'default' } });
  const futureConfig = (existing?.futureConfig as Record<string, unknown>) ?? {};
  await ctx.prisma.deliverySettings.update({
    where: { id: 'default' },
    data: {
      futureConfig: {
        ...futureConfig,
        platform: PLATFORM_SETTINGS,
      },
      updatedById: ctx.actorId,
    },
  });
  log.info('Platform settings merged into delivery_settings.futureConfig.platform');
}
