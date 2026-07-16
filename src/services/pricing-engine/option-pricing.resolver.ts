import type { OptionPricingStrategy, Prisma } from '@prisma/client';
import { decimalToNumber } from '../../utils/money.js';
import { applyAdjustment } from './pricing.rules.js';
import type { PricingContext } from './pricing.types.js';

export interface OptionPricingRecord {
  pricingStrategy: OptionPricingStrategy;
  adjustmentType: 'FIXED' | 'PERCENTAGE';
  adjustmentValue: Prisma.Decimal;
  strategyConfig: Prisma.JsonValue;
  isActive: boolean;
  quantityTiers: Array<{
    quantity: number;
    price: Prisma.Decimal;
    isActive: boolean;
  }>;
}

export interface PricingStrategy {
  readonly key: OptionPricingStrategy;
  resolve(pricing: OptionPricingRecord, context: PricingContext): number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveQuantityTierPrice(
  tiers: OptionPricingRecord['quantityTiers'],
  quantity: number,
): number | null {
  const active = tiers.filter((t) => t.isActive).sort((a, b) => a.quantity - b.quantity);
  if (active.length === 0) return null;

  const exact = active.find((t) => t.quantity === quantity);
  if (exact) return decimalToNumber(exact.price);

  const lower = [...active].filter((t) => t.quantity <= quantity).pop();
  if (lower) return decimalToNumber(lower.price);

  return decimalToNumber(active[0]!.price);
}

function readConfigNumber(config: Prisma.JsonValue, key: string, fallback = 0): number {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : Number(value) || fallback;
}

class FixedStrategy implements PricingStrategy {
  readonly key = 'FIXED' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    return applyAdjustment(context.runningTotal, 'FIXED', decimalToNumber(pricing.adjustmentValue));
  }
}

class PercentageStrategy implements PricingStrategy {
  readonly key = 'PERCENTAGE' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    return applyAdjustment(context.runningTotal, 'PERCENTAGE', decimalToNumber(pricing.adjustmentValue));
  }
}

class QuantityBasedStrategy implements PricingStrategy {
  readonly key = 'QUANTITY_BASED' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    return resolveQuantityTierPrice(pricing.quantityTiers, context.quantity) ?? 0;
  }
}

class AreaBasedStrategy implements PricingStrategy {
  readonly key = 'AREA_BASED' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    const rate = readConfigNumber(pricing.strategyConfig, 'ratePerSqCm');
    return round2(rate * (context.areaSqCm ?? 0));
  }
}

class PerSheetStrategy implements PricingStrategy {
  readonly key = 'PER_SHEET' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    const rate = readConfigNumber(pricing.strategyConfig, 'ratePerSheet', decimalToNumber(pricing.adjustmentValue));
    return round2(rate * (context.sheetCount ?? context.quantity));
  }
}

class PerPieceStrategy implements PricingStrategy {
  readonly key = 'PER_PIECE' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    const rate = readConfigNumber(pricing.strategyConfig, 'ratePerPiece', decimalToNumber(pricing.adjustmentValue));
    return round2(rate * (context.pieceCount ?? context.quantity));
  }
}

class PerBoxStrategy implements PricingStrategy {
  readonly key = 'PER_BOX' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    const rate = readConfigNumber(pricing.strategyConfig, 'ratePerBox', decimalToNumber(pricing.adjustmentValue));
    const boxSize = readConfigNumber(pricing.strategyConfig, 'piecesPerBox', 1) || 1;
    return round2(rate * (context.boxCount ?? Math.ceil(context.quantity / boxSize)));
  }
}

class FormulaStrategy implements PricingStrategy {
  readonly key = 'FORMULA' as const;

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    const multiplier = readConfigNumber(pricing.strategyConfig, 'multiplier', decimalToNumber(pricing.adjustmentValue));
    return round2(multiplier * context.quantity);
  }
}

class CustomStrategy implements PricingStrategy {
  readonly key = 'CUSTOM' as const;

  resolve(): number {
    return 0;
  }
}

const optionPricingStrategies: PricingStrategy[] = [
  new FixedStrategy(),
  new QuantityBasedStrategy(),
  new AreaBasedStrategy(),
  new PerSheetStrategy(),
  new PercentageStrategy(),
  new FormulaStrategy(),
  new PerPieceStrategy(),
  new PerBoxStrategy(),
  new CustomStrategy(),
];

export class OptionPricingResolver {
  private readonly strategies = new Map<OptionPricingStrategy, PricingStrategy>(
    optionPricingStrategies.map((strategy) => [strategy.key, strategy]),
  );

  resolve(pricing: OptionPricingRecord, context: PricingContext): number {
    if (!pricing.isActive) return 0;

    const strategy = this.strategies.get(pricing.pricingStrategy);
    if (!strategy) return 0;
    return strategy.resolve(pricing, context);
  }
}

export const optionPricingResolver = new OptionPricingResolver();

export function resolveOptionPriceAmount(
  pricing: OptionPricingRecord,
  context: PricingContext,
): number {
  return optionPricingResolver.resolve(pricing, context);
}

export function effectivePricingStrategy(pricing: OptionPricingRecord): OptionPricingStrategy {
  return pricing.pricingStrategy;
}
