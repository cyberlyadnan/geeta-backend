import type { Prisma } from '@prisma/client';
import { decimalToNumber } from '../../utils/money.js';

type OptionPricingRow = {
  pricingStrategy: string;
  adjustmentType: string;
  adjustmentValue: Prisma.Decimal;
  strategyConfig: Prisma.JsonValue;
  isActive: boolean;
  quantityTiers?: Array<{
    id: string;
    quantity: number;
    price: Prisma.Decimal;
    isActive: boolean;
  }>;
};

export function mapOptionPricingDto(pricing: OptionPricingRow | null) {
  if (!pricing) return null;
  return {
    pricingStrategy: pricing.pricingStrategy,
    adjustmentType: pricing.adjustmentType,
    adjustmentValue: decimalToNumber(pricing.adjustmentValue),
    strategyConfig:
      pricing.strategyConfig && typeof pricing.strategyConfig === 'object' && !Array.isArray(pricing.strategyConfig)
        ? (pricing.strategyConfig as Record<string, unknown>)
        : {},
    isActive: pricing.isActive,
    quantityTiers: (pricing.quantityTiers ?? []).map((t) => ({
      id: t.id,
      quantity: t.quantity,
      price: decimalToNumber(t.price),
      isActive: t.isActive,
    })),
  };
}
