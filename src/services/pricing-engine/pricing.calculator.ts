import type { Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';
import { decimalToNumber } from '../../utils/money.js';
import { applyAdjustment, evaluateCondition } from './pricing.rules.js';
import { buildPricingContext } from './pricing-context.builder.js';
import {
  resolveOptionPriceAmount,
  type OptionPricingRecord,
} from './option-pricing.resolver.js';
import type {
  PriceBreakdownLine,
  PriceCalculationInput,
  PriceCalculationResult,
  ProductSelection,
} from './pricing.types.js';

type VersionPricingBundle = {
  id: string;
  quantityPricing: Array<{ quantity: number; basePrice: Prisma.Decimal; isActive: boolean }>;
  configurationFields: Array<{
    id: string;
    code: string;
    label: string;
    options: Array<{
      id: string;
      value: string;
      label: string;
      isActive: boolean;
      pricing: (OptionPricingRecord & { id: string }) | null;
    }>;
  }>;
  pricingRules: Array<{
    id: string;
    name: string;
    condition: Prisma.JsonValue;
    adjustmentType: 'FIXED' | 'PERCENTAGE';
    adjustmentValue: Prisma.Decimal;
    priority: number;
    status: string;
    configurationFieldId: string | null;
    configurationOptionId: string | null;
  }>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveQuantityTier(
  tiers: VersionPricingBundle['quantityPricing'],
  quantity: number,
): { quantity: number; basePrice: number } | null {
  const active = tiers.filter((t) => t.isActive).sort((a, b) => a.quantity - b.quantity);
  if (active.length === 0) return null;

  const exact = active.find((t) => t.quantity === quantity);
  if (exact) {
    return { quantity: exact.quantity, basePrice: decimalToNumber(exact.basePrice) };
  }

  const lower = [...active].filter((t) => t.quantity <= quantity).pop();
  if (lower) {
    return { quantity: lower.quantity, basePrice: decimalToNumber(lower.basePrice) };
  }

  return { quantity: active[0]!.quantity, basePrice: decimalToNumber(active[0]!.basePrice) };
}

function findSelectedOptions(
  bundle: VersionPricingBundle,
  selections: ProductSelection,
): Array<{
  fieldCode: string;
  fieldLabel: string;
  optionId: string;
  optionLabel: string;
  optionValue: string;
  pricing: OptionPricingRecord;
}> {
  const matched: Array<{
    fieldCode: string;
    fieldLabel: string;
    optionId: string;
    optionLabel: string;
    optionValue: string;
    pricing: OptionPricingRecord;
  }> = [];

  for (const field of bundle.configurationFields) {
    const selectedValue = selections[field.code];
    if (!selectedValue) continue;

    const option = field.options.find(
      (o) => o.isActive && o.value === selectedValue,
    );
    if (!option?.pricing?.isActive) continue;

    matched.push({
      fieldCode: field.code,
      fieldLabel: field.label,
      optionId: option.id,
      optionLabel: option.label,
      optionValue: option.value,
      pricing: option.pricing,
    });
  }

  return matched;
}

export interface CalculatorBaseOverride {
  /** Base amount to seed the running total with, in place of the resolved quantity tier. */
  amount: number;
  label: string;
  /** Quantity band / cell identity, etc. — surfaced in the snapshot payload for audit. */
  tierQuantity: number | string;
  /** Already-computed lines (e.g. PriceModifierRule surcharges) applied before options/rules. */
  preAdjustmentLines?: PriceBreakdownLine[];
}

/**
 * Base + option-pricing + rules pipeline. Quantity-tier products (the default/legacy strategy)
 * resolve their own base here; matrix-strategy products pass `baseOverride` so the exact same
 * option-pricing (lamination FIXED, cutting QUANTITY_BASED, ...) and PricingRule stacking still
 * applies on top of a matrix cell price instead of a quantity-tier price — see
 * price-resolver.service.ts, which is the single place besides here that prices a product.
 */
export function calculatePriceFromBundle(
  bundle: VersionPricingBundle,
  input: PriceCalculationInput,
  baseOverride?: CalculatorBaseOverride,
): PriceCalculationResult {
  const { quantity, selections } = input;
  const lines: PriceBreakdownLine[] = [];

  let baseAmount: number;
  let tierQuantity: number | string;

  if (baseOverride) {
    baseAmount = baseOverride.amount;
    tierQuantity = baseOverride.tierQuantity;
    lines.push({ code: 'base', label: baseOverride.label, type: 'base', amount: baseAmount });
  } else {
    const tier = resolveQuantityTier(bundle.quantityPricing, quantity);
    if (!tier) {
      throw ApiError.badRequest('No quantity pricing configured for this product version');
    }
    baseAmount = tier.basePrice;
    tierQuantity = tier.quantity;
    lines.push({
      code: 'base',
      label: `Base price (${tier.quantity} qty tier)`,
      type: 'quantity_tier',
      amount: baseAmount,
    });
  }

  let runningTotal = baseAmount;
  let adjustmentTotal = 0;

  for (const line of baseOverride?.preAdjustmentLines ?? []) {
    lines.push(line);
    adjustmentTotal = round2(adjustmentTotal + line.amount);
    runningTotal = round2(runningTotal + line.amount);
  }

  const selectedOptions = findSelectedOptions(bundle, selections);

  for (const sel of selectedOptions) {
    const optionContext = buildPricingContext(input, runningTotal);
    const adj = resolveOptionPriceAmount(sel.pricing, optionContext);
    adjustmentTotal = round2(adjustmentTotal + adj);
    runningTotal = round2(runningTotal + adj);
    lines.push({
      code: `option:${sel.fieldCode}`,
      label: `${sel.fieldLabel}: ${sel.optionLabel}`,
      type: 'option',
      pricingStrategy: sel.pricing.pricingStrategy,
      adjustmentType: sel.pricing.adjustmentType,
      amount: adj,
    });
  }

  const activeRules = bundle.pricingRules
    .filter((r) => r.status === 'ACTIVE')
    .sort((a, b) => b.priority - a.priority);

  for (const rule of activeRules) {
    if (!evaluateCondition(rule.condition, selections, quantity)) continue;

    if (rule.configurationOptionId) {
      const alreadyApplied = selectedOptions.some((s) => s.optionId === rule.configurationOptionId);
      if (alreadyApplied) continue;
    }

    const adj = applyAdjustment(
      runningTotal,
      rule.adjustmentType,
      decimalToNumber(rule.adjustmentValue),
    );
    adjustmentTotal = round2(adjustmentTotal + adj);
    runningTotal = round2(runningTotal + adj);
    lines.push({
      code: `rule:${rule.id}`,
      label: rule.name,
      type: 'rule',
      adjustmentType: rule.adjustmentType,
      amount: adj,
    });
  }

  const subtotal = baseAmount;
  const grandTotal = runningTotal;
  const unitPrice = quantity > 0 ? round2(grandTotal / quantity) : grandTotal;

  return {
    versionId: bundle.id,
    quantity,
    subtotal,
    adjustmentTotal,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal,
    unitPrice,
    currency: 'INR',
    lines,
    snapshotPayload: {
      tierQuantity,
      selections,
      lines,
    },
  };
}
