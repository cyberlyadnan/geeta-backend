import type { OptionPricingStrategy, PricingAdjustmentType } from '@prisma/client';

export interface ProductSelection {
  /** configuration field code → option value */
  [fieldCode: string]: string;
}

export interface PricingContextSize {
  sizeCode?: string;
  width?: number;
  height?: number;
  unit?: 'MM' | 'CM' | 'INCH' | 'FT';
}

export interface PricingContext {
  quantity: number;
  runningTotal: number;
  selections?: ProductSelection;
  selectedSize?: PricingContextSize;
  areaSqCm?: number;
  sheetCount?: number;
  sheetSize?: string | null;
  paperMaterial?: string | null;
  printProcess?: string | null;
  lamination?: string | null;
  uv?: string | null;
  foil?: string | null;
  embossing?: string | null;
  eyelets?: string | null;
  dispatchOption?: string | null;
  customerType?: string | null;
  productionPriority?: string | null;
  facility?: string | null;
  machine?: string | null;
  pieceCount?: number;
  boxCount?: number;
  runtimeValues?: Record<string, unknown>;
}

export type OptionPricingContext = PricingContext;

export interface PriceCalculationInput {
  versionId: string;
  quantity: number;
  selections: ProductSelection;
  /** Optional runtime inputs for context-based pricing strategies */
  context?: Partial<Omit<PricingContext, 'quantity' | 'runningTotal'>>;
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
