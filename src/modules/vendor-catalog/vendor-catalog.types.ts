export interface CatalogVersionGroupsDto {
  category: string;
  family: string;
  series: string;
  product: string;
  productVersion: string;
  pricing: string;
  configuration: string;
  workflow: string;
  artwork: string;
}

export interface CatalogVersionDto {
  catalogVersion: string;
  catalogUpdatedAt: string;
  versionGroups: CatalogVersionGroupsDto;
  etag?: string;
}

export interface StaticBootstrapDto {
  categories: unknown[];
}

export interface CatalogBranchBootstrapDto {
  families: VendorBootstrapFamilyDto[];
  series: VendorBootstrapSeriesDto[];
  products: VendorBootstrapProductDto[];
}

export interface VendorBootstrapFamilyDto {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  seriesCount: number;
  productCount: number;
}

export interface VendorBootstrapSeriesDto {
  id: string;
  familyId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount: number;
}

export interface VendorBootstrapProductDto {
  id: string;
  seriesId: string;
  familyId: string;
  categoryId: string;
  name: string;
  slug: string;
  displayName: string | null;
  shortDescription: string | null;
  description: string | null;
  /** Thumbnail URL only — never original image bytes. */
  thumbnailUrl: string | null;
  status: string;
  sortOrder: number;
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

/** Lightweight DTO for vendor product selection (Series is resolved server-side). */
export interface VendorFamilyProductDto {
  id: string;
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  status: string;
  sortOrder: number;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  defaultVersion: {
    id: string;
    versionNumber: number;
    status: string;
  } | null;
}

export interface VendorBootstrapDto extends CatalogVersionDto {
  /** Structured bootstrap — static masters vs catalog branch (lazy-load ready). */
  static: StaticBootstrapDto;
  catalog: CatalogBranchBootstrapDto;
  /** Flat fields — backward compatible with MVP clients. */
  categories: unknown[];
  families: VendorBootstrapFamilyDto[];
  series: VendorBootstrapSeriesDto[];
  products: VendorBootstrapProductDto[];
}
