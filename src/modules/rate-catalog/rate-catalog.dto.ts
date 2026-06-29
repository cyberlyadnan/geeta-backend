export type RateMatrixMode = 'quantity_break' | 'area_based' | 'coverage' | 'fixed';

export interface RateCatalogPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface RateCatalogCategoryDto {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  parentId: string | null;
  parentName: string | null;
  productCount: number;
}

export interface RateCatalogProductCardDto {
  id: string;
  name: string;
  slug: string;
  displayName: string | null;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  category: { id: string; name: string; slug: string };
  printProcess: { code: string; name: string } | null;
  pricingStrategy: { key: string; label: string } | null;
  versionId: string;
  versionLabel: string;
  versionNumber: number;
  updatedAt: string;
  publishedAt: string | null;
}

export interface RateMatrixColumnDto {
  key: string;
  label: string;
  quantity?: number;
  width?: number | null;
  height?: number | null;
  unit?: string | null;
}

export interface RateMatrixCellDto {
  columnKey: string;
  basePrice: number;
  adjustmentTotal: number;
  grandTotal: number;
  unitPrice: number;
  gstRate: number;
  gstAmount: number;
  totalWithGst: number;
  currency: string;
  sizeAdjustment?: number;
  minimumCharge?: number | null;
}

export interface RateMatrixRowDto {
  key: string;
  label: string;
  selections: Record<string, string>;
  selectionLabels: Record<string, string>;
  width?: number | null;
  height?: number | null;
  areaLabel?: string | null;
  cells: RateMatrixCellDto[];
}

export interface RateMatrixDimensionDto {
  code: string;
  label: string;
  values: Array<{ value: string; label: string }>;
}

export interface RateCatalogProductRatesDto {
  product: {
    id: string;
    name: string;
    slug: string;
    thumbnailUrl: string | null;
    category: { id: string; name: string; slug: string };
  };
  printProcess: { code: string; name: string } | null;
  pricingStrategy: { key: string; label: string };
  version: {
    id: string;
    versionLabel: string;
    versionNumber: number;
    effectiveFrom: string;
    publishedAt: string | null;
    updatedAt: string;
  };
  currency: string;
  gstRate: number;
  gstLabel: string;
  configurationSummary: Array<{ code: string; label: string; defaultValue: string; defaultLabel: string }>;
  matrix: {
    mode: RateMatrixMode;
    columns: RateMatrixColumnDto[];
    rows: RateMatrixRowDto[];
    dimensions: RateMatrixDimensionDto[];
    rowMeta: RateCatalogPaginationMeta;
  };
  generatedAt: string;
  filtersApplied: Record<string, string>;
  /** Future: dealer / distributor / VIP rate list keys */
  rateListType: 'vendor_standard';
}

export interface RateCatalogFilterOptionsDto {
  categories: Array<{ id: string; name: string; slug: string }>;
  printProcesses: Array<{ code: string; name: string }>;
  pricingStrategies: Array<{ key: string; label: string }>;
  configurationFields: Array<{ code: string; label: string; values: Array<{ value: string; label: string }> }>;
}
