import { ApiError } from '../../common/errors/ApiError.js';
import { decimalToNumber } from '../../utils/money.js';
import {
  pricingRepository,
  resolvePricingStrategyKey,
  type VersionPricingBundle,
} from '../../repositories/pricing.repository.js';
import {
  vendorPriceOverrideRepository,
  type VendorPriceOverrideRepository,
} from '../../repositories/vendor-price-override.repository.js';
import { calculatePriceFromBundle, type CalculatorBaseOverride } from './pricing.calculator.js';
import { resolveMatrixPrice, applyPriceModifierRules } from './matrix-pricing.resolver.js';
import { resolveChargeableSize } from './chargeable-size.resolver.js';
import { applyVendorOverride, type VendorPriceOverrideRecord } from './vendor-price-override.resolver.js';
import type { PriceBreakdownLine, PriceCalculationInput, PriceCalculationResult, ProductSelection } from './pricing.types.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ResolvePriceInput {
  versionId: string;
  /** Undefined for admin/anonymous previews — no vendor override lookup happens in that case. */
  vendorId?: string;
  quantity: number;
  selections: ProductSelection;
  /** Required for flex_area strategy products; already converted to feet by the caller. */
  uploadedDimensions?: { widthFt: number; heightFt: number };
  context?: PriceCalculationInput['context'];
}

export interface ResolvePriceResult {
  valid: boolean;
  reason?: string;
  versionId: string;
  quantity: number;
  strategyKey: string;
  /** Price before any vendor override — what the rate catalogue shows a non-overridden vendor. */
  listPrice: number;
  /** Price actually charged — equals listPrice when no override applies. */
  finalPrice: number;
  overrideApplied: boolean;
  unitPrice: number;
  currency: string;
  lines: PriceBreakdownLine[];
  snapshotPayload: Record<string, unknown>;
  chargedWidthFt?: number;
  chargedLengthFt?: number;
  chargedAreaSqFt?: number;
  wasRounded?: boolean;
}

/**
 * The one pricing resolver — rate catalogue, order preview, and order placement all call this
 * and only this (see docs/features/02-phase0-pricing-spine.md, non-negotiable #1). It dispatches
 * the *base* price by strategy key (matrix cell lookup / roll-flex chargeable area / the existing
 * quantity-tier calculator), then always runs the same option-pricing + PricingRule pipeline and
 * vendor-override step on top, so every product — old or new — is priced through one path.
 */
export class PriceResolverService {
  constructor(private readonly overrides: VendorPriceOverrideRepository = vendorPriceOverrideRepository) {}

  async resolvePrice(input: ResolvePriceInput): Promise<ResolvePriceResult> {
    const bundle = await pricingRepository.loadVersionBundle(input.versionId);
    if (!bundle) {
      throw ApiError.notFound('Product version not found');
    }

    const strategyKey = resolvePricingStrategyKey(bundle);

    if (strategyKey === 'flex_area') {
      return this.resolveFlexArea(bundle, input, strategyKey);
    }
    if (strategyKey === 'matrix') {
      return this.resolveMatrixStrategy(bundle, input, strategyKey);
    }
    if (strategyKey === 'fixed_catalog') {
      return this.resolveFixedCatalog(bundle, input, strategyKey);
    }
    return this.resolveDefaultStrategy(bundle, input, strategyKey);
  }

  private async loadOverrides(input: ResolvePriceInput): Promise<VendorPriceOverrideRecord[]> {
    if (!input.vendorId) return [];
    return this.overrides.loadForVendorAndVersion(input.vendorId, input.versionId);
  }

  private async resolveDefaultStrategy(
    bundle: VersionPricingBundle,
    input: ResolvePriceInput,
    strategyKey: string,
  ): Promise<ResolvePriceResult> {
    const calcInput: PriceCalculationInput = {
      versionId: input.versionId,
      quantity: input.quantity,
      selections: input.selections,
      context: input.context,
    };

    const listResult = calculatePriceFromBundle(bundle, calcInput);

    const overrides = await this.loadOverrides(input);
    const override = this.overrides.pickApplicable(overrides, null);

    let finalResult = listResult;
    if (override) {
      const overriddenBase: CalculatorBaseOverride = {
        amount: applyVendorOverride(listResult.subtotal, override),
        label: listResult.lines[0]!.label,
        tierQuantity: listResult.snapshotPayload['tierQuantity'] as number,
      };
      finalResult = calculatePriceFromBundle(bundle, calcInput, overriddenBase);
    }

    return this.toResult({
      strategyKey,
      listResult,
      finalResult,
      overrideApplied: !!override,
      matrixCellId: null,
    });
  }

  private async resolveMatrixStrategy(
    bundle: VersionPricingBundle,
    input: ResolvePriceInput,
    strategyKey: string,
  ): Promise<ResolvePriceResult> {
    const matrix = resolveMatrixPrice(
      bundle.priceMatrixCells,
      bundle.quantityPricing,
      input.selections,
      input.quantity,
    );

    if (!matrix.valid || matrix.price == null || !matrix.cellId) {
      return this.invalid(strategyKey, matrix.reason ?? 'This combination is not available', input);
    }

    const calcInput: PriceCalculationInput = {
      versionId: input.versionId,
      quantity: input.quantity,
      selections: input.selections,
      context: input.context,
    };

    /**
     * Matrix cells and their surcharges are per-unit rates off one rate card — "11+ = ₹15" means
     * ₹15 a sheet, and a both-sides or lamination surcharge is likewise charged on every sheet.
     * Quantity used to select the band and then be discarded, so 11 sheets at ₹15 billed ₹15.
     * Each line is scaled here rather than in the calculator so the legacy quantity-tier strategy,
     * whose tier price really is a whole-order amount, keeps its existing meaning.
     */
    const qty = Math.max(1, input.quantity);
    const band = matrix.qtyBand ?? 'default';
    const perUnit = (amount: number, label: string): string =>
      qty > 1 ? `${label} (₹${String(amount)} × ${String(qty)})` : label;

    const buildBase = (cellPrice: number): CalculatorBaseOverride => {
      const { lines } = applyPriceModifierRules(cellPrice, bundle.priceModifierRules, input.selections);
      return {
        amount: round2(cellPrice * qty),
        label: perUnit(cellPrice, `Matrix price (${band})`),
        tierQuantity: band,
        preAdjustmentLines: lines.map((line) => ({
          ...line,
          amount: round2(line.amount * qty),
          label: perUnit(line.amount, line.label),
        })),
      };
    };

    const listResult = calculatePriceFromBundle(bundle, calcInput, buildBase(matrix.price));

    const overrides = await this.loadOverrides(input);
    const override = this.overrides.pickApplicable(overrides, matrix.cellId);

    let finalResult = listResult;
    if (override) {
      const overriddenCellPrice = applyVendorOverride(matrix.price, override);
      finalResult = calculatePriceFromBundle(bundle, calcInput, buildBase(overriddenCellPrice));
    }

    return this.toResult({
      strategyKey,
      listResult,
      finalResult,
      overrideApplied: !!override,
      matrixCellId: matrix.cellId,
      dimensionKey: matrix.dimensionKey,
    });
  }

  /**
   * Catalog products (Phase 4): the admin-set `fixedPrice` IS the price. No matrix, no quantity
   * tiers, no option stacking — a wedding-card design costs what the card costs. A whole-product
   * vendor override still applies on top, so non-negotiable #2 (sparse overrides everywhere)
   * holds here as it does for every other strategy.
   */
  private async resolveFixedCatalog(
    bundle: VersionPricingBundle,
    input: ResolvePriceInput,
    strategyKey: string,
  ): Promise<ResolvePriceResult> {
    const fixedPrice = bundle.fixedPrice != null ? decimalToNumber(bundle.fixedPrice) : null;
    if (fixedPrice == null) {
      return this.invalid(strategyKey, 'This catalog product has no price set yet', input);
    }
    if (input.quantity <= 0) {
      return this.invalid(strategyKey, 'Quantity must be at least 1', input);
    }

    const buildResult = (unitPrice: number): PriceCalculationResult => ({
      versionId: input.versionId,
      quantity: input.quantity,
      subtotal: unitPrice,
      adjustmentTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: round2(unitPrice * input.quantity),
      unitPrice,
      currency: 'INR',
      lines: [{ code: 'base', label: 'Catalog price', type: 'base', amount: unitPrice }],
      snapshotPayload: { selections: input.selections, fixedPrice: unitPrice },
    });

    const listResult = buildResult(fixedPrice);

    const overrides = await this.loadOverrides(input);
    const override = this.overrides.pickApplicable(overrides, null);
    const finalResult = override ? buildResult(applyVendorOverride(fixedPrice, override)) : listResult;

    return this.toResult({
      strategyKey,
      listResult,
      finalResult,
      overrideApplied: !!override,
      matrixCellId: null,
    });
  }

  private async resolveFlexArea(
    bundle: VersionPricingBundle,
    input: ResolvePriceInput,
    strategyKey: string,
  ): Promise<ResolvePriceResult> {
    const ratePerSqFt = bundle.ratePerSqFt != null ? decimalToNumber(bundle.ratePerSqFt) : null;
    if (ratePerSqFt == null) {
      return this.invalid(strategyKey, 'Rate per sq ft is not configured for this product', input);
    }
    if (!input.uploadedDimensions) {
      return this.invalid(strategyKey, 'Design dimensions are required to price this product', input);
    }

    const availableWidths = bundle.rollWidthOptions.map((w) => decimalToNumber(w.widthFeet));
    const sizing = resolveChargeableSize(
      input.uploadedDimensions.widthFt,
      input.uploadedDimensions.heightFt,
      availableWidths,
      ratePerSqFt,
    );

    if (!sizing.valid || sizing.price == null) {
      return this.invalid(strategyKey, sizing.reason ?? 'This size is not available', input);
    }

    // Per the phase doc, roll/flex has no configuration-option stacking — the area price is the
    // whole base. A whole-product ("matrixCellId: null") vendor override applies directly to it.
    const buildResult = (unitPrice: number): PriceCalculationResult => ({
      versionId: input.versionId,
      quantity: input.quantity,
      subtotal: unitPrice,
      adjustmentTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: round2(unitPrice * input.quantity),
      unitPrice,
      currency: 'INR',
      lines: [
        {
          code: 'base',
          label: `Roll/flex area (${sizing.chargedWidth}x${sizing.chargedLength} ft)`,
          type: 'base',
          amount: unitPrice,
        },
      ],
      snapshotPayload: {
        selections: input.selections,
        chargedWidthFt: sizing.chargedWidth,
        chargedLengthFt: sizing.chargedLength,
        chargedAreaSqFt: sizing.chargedArea,
        wasRounded: sizing.wasRounded,
      },
    });

    const listResult = buildResult(sizing.price);

    const overrides = await this.loadOverrides(input);
    const override = this.overrides.pickApplicable(overrides, null);
    const finalResult = override ? buildResult(applyVendorOverride(sizing.price, override)) : listResult;

    return this.toResult({
      strategyKey,
      listResult,
      finalResult,
      overrideApplied: !!override,
      matrixCellId: null,
      flexMeta: {
        chargedWidthFt: sizing.chargedWidth!,
        chargedLengthFt: sizing.chargedLength!,
        chargedAreaSqFt: sizing.chargedArea!,
        wasRounded: sizing.wasRounded!,
      },
    });
  }

  private toResult(args: {
    strategyKey: string;
    listResult: PriceCalculationResult;
    finalResult: PriceCalculationResult;
    overrideApplied: boolean;
    matrixCellId: string | null;
    dimensionKey?: Record<string, string>;
    flexMeta?: {
      chargedWidthFt: number;
      chargedLengthFt: number;
      chargedAreaSqFt: number;
      wasRounded: boolean;
    };
  }): ResolvePriceResult {
    const { strategyKey, listResult, finalResult, overrideApplied, matrixCellId, dimensionKey, flexMeta } = args;
    return {
      valid: true,
      versionId: finalResult.versionId,
      quantity: finalResult.quantity,
      strategyKey,
      listPrice: listResult.grandTotal,
      finalPrice: finalResult.grandTotal,
      overrideApplied,
      unitPrice: finalResult.unitPrice,
      currency: finalResult.currency,
      lines: finalResult.lines,
      snapshotPayload: {
        ...finalResult.snapshotPayload,
        strategyKey,
        listPrice: listResult.grandTotal,
        finalPrice: finalResult.grandTotal,
        overrideApplied,
        matrixCellId,
        dimensionKey,
      },
      ...flexMeta,
    };
  }

  private invalid(strategyKey: string, reason: string, input: ResolvePriceInput): ResolvePriceResult {
    return {
      valid: false,
      reason,
      versionId: input.versionId,
      quantity: input.quantity,
      strategyKey,
      listPrice: 0,
      finalPrice: 0,
      overrideApplied: false,
      unitPrice: 0,
      currency: 'INR',
      lines: [],
      snapshotPayload: {},
    };
  }
}

export const priceResolverService = new PriceResolverService();
