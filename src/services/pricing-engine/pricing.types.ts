import type { OptionPricingStrategy, PricingAdjustmentType } from '@prisma/client';

export interface ProductSelection {
  /** configuration field code → option value */
  [fieldCode: string]: string;
}

export interface OptionPricingContext {
  quantity: number;
  runningTotal: number;
  areaSqCm?: number;
  sheetCount?: number;
  pieceCount?: number;
  boxCount?: number;
}

export interface PriceCalculationInput {
  versionId: string;
  quantity: number;
  selections: ProductSelection;
  /** Optional runtime dimensions for area/sheet/box strategies */
  context?: Partial<Omit<OptionPricingContext, 'quantity' | 'runningTotal'>>;
}

export interface PriceBreakdownLine {
  code: string;
  label: string;
  type: 'base' | 'option' | 'rule' | 'quantity_tier';
  pricingStrategy?: OptionPricingStrategy;
  adjustmentType?: PricingAdjustmentType;
  amount: number;
}

export interface PriceCalculationResult {
  versionId: string;
  quantity: number;
  subtotal: number;
  adjustmentTotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  unitPrice: number;
  currency: string;
  lines: PriceBreakdownLine[];
  snapshotPayload: Record<string, unknown>;
}

export interface PricingPreviewInput extends PriceCalculationInput {
  productId?: string;
}
