import { priceResolverService } from '../../services/pricing-engine/price-resolver.service.js';
import { toFeet } from '../../services/pricing-engine/chargeable-size.resolver.js';
import { buildConfigurationDisplayLabel } from './rate-catalog.label-formatter.js';
import type {
  RateMatrixCellDto,
  RateMatrixColumnDto,
  RateMatrixDimensionDto,
  RateMatrixMode,
  RateMatrixRowDto,
  RateCatalogPaginationMeta,
} from './rate-catalog.dto.js';

type VersionBundle = NonNullable<Awaited<ReturnType<typeof import('../../repositories/pricing.repository.js').pricingRepository.loadVersionBundle>>>;

type SizePreset = {
  code: string;
  label: string;
  width: number | null;
  height: number | null;
  unit: string | null;
  areaCm2: number | null;
};

const AREA_STRATEGY_KEYS = new Set([
  'per_sqft',
  'per_sqm',
  'flex_area',
  'vinyl_area',
  'canvas_area',
  'board_area',
]);

const COVERAGE_STRATEGY_KEYS = new Set([
  'coverage_based',
  'spot_uv_coverage',
  'raised_uv_coverage',
  'foil_coverage',
  'white_ink',
]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}


function resolveMatrixMode(strategyKey: string | null | undefined): RateMatrixMode {
  if (!strategyKey) return 'quantity_break';
  if (AREA_STRATEGY_KEYS.has(strategyKey)) return 'area_based';
  if (COVERAGE_STRATEGY_KEYS.has(strategyKey)) return 'coverage';
  if (strategyKey === 'formula_based') return 'fixed';
  return 'quantity_break';
}

function buildDimensions(bundle: VersionBundle): RateMatrixDimensionDto[] {
  return bundle.configurationFields
    .filter((f) => f.options.some((o) => o.isActive))
    .map((field) => ({
      code: field.code,
      label: field.label,
      values: field.options
        .filter((o) => o.isActive)
        .map((o) => ({ value: o.value, label: o.label })),
    }));
}

function defaultSelections(bundle: VersionBundle): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const field of bundle.configurationFields) {
    const first = field.options.find((o) => o.isActive);
    if (first) selections[field.code] = first.value;
  }
  return selections;
}

function selectionLabels(
  bundle: VersionBundle,
  selections: Record<string, string>,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const field of bundle.configurationFields) {
    const val = selections[field.code];
    if (!val) continue;
    const opt = field.options.find((o) => o.value === val);
    if (opt) labels[field.code] = opt.label;
  }
  return labels;
}

function rowLabelFromSelections(
  bundle: VersionBundle,
  selections: Record<string, string>,
  labels: Record<string, string>,
): string {
  return buildConfigurationDisplayLabel(
    bundle.configurationFields.map((f) => ({
      code: f.code,
      label: f.label,
      sortOrder: f.sortOrder ?? 0,
    })),
    selections,
    labels,
  );
}

function cartesianRows(
  bundle: VersionBundle,
  fixedFilters: Record<string, string>,
): Array<{ selections: Record<string, string>; key: string }> {
  const variableFields = bundle.configurationFields.filter((f) => {
    if (fixedFilters[f.code]) return false;
    return f.options.some((o) => o.isActive);
  });

  if (variableFields.length === 0) {
    const selections = { ...defaultSelections(bundle), ...fixedFilters };
    const key = Object.entries(selections)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    return [{ selections, key }];
  }

  const optionSets = variableFields.map((field) =>
    field.options
      .filter((o) => o.isActive)
      .map((o) => ({ fieldCode: field.code, value: o.value })),
  );

  const combos = optionSets.reduce<Array<Record<string, string>>>(
    (acc, set) =>
      acc.flatMap((prev) => set.map((item) => ({ ...prev, [item.fieldCode]: item.value }))),
    [{}],
  );

  return combos.map((partial) => {
    const selections = { ...defaultSelections(bundle), ...partial, ...fixedFilters };
    const key = Object.entries(selections)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    return { selections, key };
  });
}

function buildQuantityColumns(bundle: VersionBundle): RateMatrixColumnDto[] {
  return bundle.quantityPricing
    .filter((t) => t.isActive)
    .sort((a, b) => a.quantity - b.quantity)
    .map((t) => ({
      key: `qty-${t.quantity}`,
      label: String(t.quantity),
      quantity: t.quantity,
    }));
}

async function computeCell(
  bundle: VersionBundle,
  quantity: number,
  selections: Record<string, string>,
  gstRate: number,
  vendorId: string | undefined,
  uploadedDimensionsFt: { widthFt: number; heightFt: number } | undefined,
  sizeAdjustment = 0,
  minimumCharge: number | null = null,
): Promise<RateMatrixCellDto> {
  const result = await priceResolverService.resolvePrice({
    versionId: bundle.id,
    vendorId,
    quantity,
    selections,
    uploadedDimensions: uploadedDimensionsFt,
  });

  if (!result.valid) {
    return {
      columnKey: `qty-${quantity}`,
      available: false,
      unavailableReason: result.reason,
      basePrice: 0,
      adjustmentTotal: 0,
      listPrice: 0,
      grandTotal: 0,
      overrideApplied: false,
      unitPrice: 0,
      gstRate,
      gstAmount: 0,
      totalWithGst: 0,
      currency: result.currency,
    };
  }

  let grandTotal = round2(result.finalPrice + sizeAdjustment);
  if (minimumCharge != null && grandTotal < minimumCharge) {
    grandTotal = minimumCharge;
  }
  const gstAmount = round2(grandTotal * gstRate);
  const basePrice = result.lines.find((l) => l.code === 'base')?.amount ?? 0;

  return {
    columnKey: `qty-${quantity}`,
    available: true,
    basePrice,
    adjustmentTotal: round2(grandTotal - basePrice),
    listPrice: round2(result.listPrice + sizeAdjustment),
    grandTotal,
    overrideApplied: result.overrideApplied,
    unitPrice: quantity > 0 ? round2(grandTotal / quantity) : grandTotal,
    gstRate,
    gstAmount,
    totalWithGst: round2(grandTotal + gstAmount),
    currency: result.currency,
    sizeAdjustment: sizeAdjustment || undefined,
    minimumCharge,
  };
}

export interface BuildMatrixInput {
  bundle: VersionBundle;
  pricingStrategyKey: string | null;
  gstRate: number;
  rowPage: number;
  rowLimit: number;
  filters: Record<string, string>;
  /** Vendor viewing the catalogue — undefined for admin/anonymous previews (no override lookup). */
  vendorId?: string;
  sizePresets?: SizePreset[];
  coverageMinCharge?: number | null;
}

export interface BuiltRateMatrix {
  mode: RateMatrixMode;
  columns: RateMatrixColumnDto[];
  rows: RateMatrixRowDto[];
  dimensions: RateMatrixDimensionDto[];
  rowMeta: RateCatalogPaginationMeta;
}

export async function buildRateMatrix(input: BuildMatrixInput): Promise<BuiltRateMatrix> {
  const mode = resolveMatrixMode(input.pricingStrategyKey);
  const dimensions = buildDimensions(input.bundle);
  const columns = buildQuantityColumns(input.bundle);

  if (mode === 'area_based' && input.sizePresets && input.sizePresets.length > 0) {
    return buildAreaMatrix(input, columns, dimensions, mode);
  }

  return buildQuantityBreakMatrix(input, columns, dimensions, mode);
}

async function buildQuantityBreakMatrix(
  input: BuildMatrixInput,
  columns: RateMatrixColumnDto[],
  dimensions: RateMatrixDimensionDto[],
  mode: RateMatrixMode,
): Promise<BuiltRateMatrix> {
  const allRows = cartesianRows(input.bundle, input.filters);
  const total = allRows.length;
  const skip = (input.rowPage - 1) * input.rowLimit;
  const pageRows = allRows.slice(skip, skip + input.rowLimit);

  const rows: RateMatrixRowDto[] = await Promise.all(
    pageRows.map(async ({ selections, key }) => {
      const labels = selectionLabels(input.bundle, selections);
      const cells = await Promise.all(
        columns.map(async (col) => {
          const qty = col.quantity ?? 1;
          const cell = await computeCell(
            input.bundle,
            qty,
            selections,
            input.gstRate,
            input.vendorId,
            undefined,
            0,
            input.coverageMinCharge ?? null,
          );
          return { ...cell, columnKey: col.key };
        }),
      );
      return {
        key,
        label: rowLabelFromSelections(input.bundle, selections, labels),
        selections,
        selectionLabels: labels,
        cells,
      };
    }),
  );

  return {
    mode,
    columns,
    rows,
    dimensions,
    rowMeta: {
      page: input.rowPage,
      limit: input.rowLimit,
      total,
      totalPages: Math.ceil(total / input.rowLimit) || 1,
      hasMore: skip + input.rowLimit < total,
      nextCursor: skip + input.rowLimit < total ? String(input.rowPage + 1) : null,
    },
  };
}

async function buildAreaMatrix(
  input: BuildMatrixInput,
  columns: RateMatrixColumnDto[],
  dimensions: RateMatrixDimensionDto[],
  mode: RateMatrixMode,
): Promise<BuiltRateMatrix> {
  const baseSelections = { ...defaultSelections(input.bundle), ...input.filters };
  const presets = input.sizePresets ?? [];
  const total = presets.length;
  const skip = (input.rowPage - 1) * input.rowLimit;
  const pagePresets = presets.slice(skip, skip + input.rowLimit);

  const areaColumns: RateMatrixColumnDto[] =
    columns.length > 0
      ? columns
      : [{ key: 'qty-1', label: '1', quantity: 1 }];

  const rows: RateMatrixRowDto[] = await Promise.all(
    pagePresets.map(async (preset) => {
      const areaSqFt =
        preset.areaCm2 != null ? round2(preset.areaCm2 / 929.03) : null;
      const areaLabel =
        preset.width && preset.height
          ? `${preset.width}×${preset.height} ${preset.unit ?? 'MM'}${areaSqFt ? ` (${areaSqFt} sq ft)` : ''}`
          : preset.label;

      // Roll/flex ("flex_area") strategy products price per uploaded design, not per catalog
      // option — this preset stands in as "what if a vendor uploads exactly this size" so the
      // catalogue can still show an indicative rate per row.
      const uploadedDimensions =
        input.pricingStrategyKey === 'flex_area' && preset.width && preset.height
          ? { widthFt: toFeet(preset.width, preset.unit), heightFt: toFeet(preset.height, preset.unit) }
          : undefined;

      const cells = await Promise.all(
        areaColumns.map(async (col) => {
          const qty = col.quantity ?? 1;
          const cell = await computeCell(
            input.bundle,
            qty,
            baseSelections,
            input.gstRate,
            input.vendorId,
            uploadedDimensions,
          );
          return { ...cell, columnKey: col.key };
        }),
      );

      return {
        key: `size:${preset.code}`,
        label: preset.label,
        selections: baseSelections,
        selectionLabels: selectionLabels(input.bundle, baseSelections),
        width: preset.width,
        height: preset.height,
        areaLabel,
        cells,
      };
    }),
  );

  const areaDimensionColumns: RateMatrixColumnDto[] = [
    { key: 'width', label: 'Width' },
    { key: 'height', label: 'Height' },
    { key: 'area', label: 'Area' },
    ...areaColumns,
  ];

  return {
    mode,
    columns: areaDimensionColumns,
    rows,
    dimensions,
    rowMeta: {
      page: input.rowPage,
      limit: input.rowLimit,
      total,
      totalPages: Math.ceil(total / input.rowLimit) || 1,
      hasMore: skip + input.rowLimit < total,
      nextCursor: skip + input.rowLimit < total ? String(input.rowPage + 1) : null,
    },
  };
}

export { resolveMatrixMode, defaultSelections, selectionLabels };
