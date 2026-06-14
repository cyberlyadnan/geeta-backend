import type { PricingAdjustmentType } from '@prisma/client';

export interface ProductSelection {
  /** configuration field code → option value */
  [fieldCode: string]: string;
}

export interface PriceCalculationInput {
  versionId: string;
  quantity: number;
  selections: ProductSelection;
}

export interface PriceBreakdownLine {
  code: string;
  label: string;
  type: 'base' | 'option' | 'rule' | 'quantity_tier';
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
