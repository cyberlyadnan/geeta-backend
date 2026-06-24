import { z } from 'zod';
import { DeliveryPreference } from '@prisma/client';

export const updateDeliveryPreferenceSchema = z.object({
  deliveryPreference: z.nativeEnum(DeliveryPreference),
});

export const calculateOrderDeliverySchema = z.object({
  productTotal: z.number().min(0),
  orderDeliveryChoice: z.boolean().optional().nullable(),
  deliveryAddress: z.string().max(2000).optional().nullable(),
});

export const updateAdminDeliverySettingsSchema = z.object({
  defaultDeliveryCharge: z.number().min(0).max(1_000_000).optional(),
  isDeliveryEnabled: z.boolean().optional(),
  isPickupEnabled: z.boolean().optional(),
});

export type UpdateDeliveryPreferenceInput = z.infer<typeof updateDeliveryPreferenceSchema>;
export type CalculateOrderDeliveryInput = z.infer<typeof calculateOrderDeliverySchema>;
export type UpdateAdminDeliverySettingsInput = z.infer<typeof updateAdminDeliverySettingsSchema>;
