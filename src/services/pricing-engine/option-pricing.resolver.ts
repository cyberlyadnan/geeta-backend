import type { OptionPricingStrategy, Prisma } from '@prisma/client';
import { decimalToNumber } from '../../utils/money.js';
import { applyAdjustment } from './pricing.rules.js';

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

export interface OptionPricingContext {
  quantity: number;
  runningTotal: number;
  areaSqCm?: number;
  sheetCount?: number;
  pieceCount?: number;
  boxCount?: number;
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

/**
 * Resolves the additive monetary amount for a selected configuration option.
 * Legacy rows without pricingStrategy still work via adjustmentType/adjustmentValue.
 */
export function resolveOptionPriceAmount(
  pricing: OptionPricingRecord,
  context: OptionPricingContext,
): number {
  if (!pricing.isActive) return 0;

  const strategy = pricing.pricingStrategy;
  const adjustmentValue = decimalToNumber(pricing.adjustmentValue);

  switch (strategy) {
    case 'FIXED':
      return applyAdjustment(context.runningTotal, 'FIXED', adjustmentValue);

    case 'PERCENTAGE':
      return applyAdjustment(context.runningTotal, 'PERCENTAGE', adjustmentValue);

    case 'QUANTITY_BASED': {
      const tierPrice = resolveQuantityTierPrice(pricing.quantityTiers, context.quantity);
      return tierPrice ?? 0;
    }

    case 'AREA_BASED': {
      const rate = readConfigNumber(pricing.strategyConfig, 'ratePerSqCm');
      const area = context.areaSqCm ?? 0;
      return round2(rate * area);
    }

    case 'PER_SHEET': {
      const rate = readConfigNumber(pricing.strategyConfig, 'ratePerSheet', adjustmentValue);
      const sheets = context.sheetCount ?? context.quantity;
      return round2(rate * sheets);
    }

    case 'PER_PIECE': {
      const rate = readConfigNumber(pricing.strategyConfig, 'ratePerPiece', adjustmentValue);
      const pieces = context.pieceCount ?? context.quantity;
      return round2(rate * pieces);
    }

    case 'PER_BOX': {
      const rate = readConfigNumber(pricing.strategyConfig, 'ratePerBox', adjustmentValue);
      const boxSize = readConfigNumber(pricing.strategyConfig, 'piecesPerBox', 1) || 1;
      const boxes = context.boxCount ?? Math.ceil(context.quantity / boxSize);
      return round2(rate * boxes);
    }

    case 'FORMULA': {
      // Minimal safe formula: multiplier × quantity (extend via strategyConfig in future).
      const multiplier = readConfigNumber(pricing.strategyConfig, 'multiplier', adjustmentValue);
      return round2(multiplier * context.quantity);
    }

    case 'CUSTOM':
    default:
      return 0;
  }
}

export function effectivePricingStrategy(pricing: OptionPricingRecord): OptionPricingStrategy {
  return pricing.pricingStrategy;
}
