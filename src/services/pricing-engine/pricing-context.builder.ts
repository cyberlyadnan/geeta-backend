import type { PricingContext, PriceCalculationInput } from './pricing.types.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCm(value: number, unit: NonNullable<PricingContext['selectedSize']>['unit']): number {
  switch (unit) {
    case 'MM':
      return value / 10;
    case 'INCH':
      return value * 2.54;
    case 'FT':
      return value * 30.48;
    case 'CM':
    default:
      return value;
  }
}

function deriveAreaSqCm(size?: PricingContext['selectedSize']): number | undefined {
  if (!size?.width || !size?.height) return undefined;
  const unit = size.unit ?? 'MM';
  return round2(toCm(size.width, unit) * toCm(size.height, unit));
}

export function buildPricingContext(
  input: PriceCalculationInput,
  runningTotal: number,
): PricingContext {
  const context: PricingContext = {
    quantity: input.quantity,
    runningTotal,
    selections: input.selections,
    selectedSize: input.context?.selectedSize,
    areaSqCm: input.context?.areaSqCm,
    sheetCount: input.context?.sheetCount,
    sheetSize: input.context?.sheetSize,
    paperMaterial: input.context?.paperMaterial,
    printProcess: input.context?.printProcess,
    lamination: input.context?.lamination,
    uv: input.context?.uv,
    foil: input.context?.foil,
    embossing: input.context?.embossing,
    eyelets: input.context?.eyelets,
    dispatchOption: input.context?.dispatchOption,
    customerType: input.context?.customerType,
    productionPriority: input.context?.productionPriority,
    facility: input.context?.facility,
    machine: input.context?.machine,
    pieceCount: input.context?.pieceCount,
    boxCount: input.context?.boxCount,
    runtimeValues: input.context?.runtimeValues,
  };

  if (context.areaSqCm == null) {
    context.areaSqCm = deriveAreaSqCm(context.selectedSize);
  }

  return context;
}
