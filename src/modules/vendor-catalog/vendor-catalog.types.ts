export interface CatalogVersionDto {
  catalogVersion: string;
  catalogUpdatedAt: string;
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
  thumbnailUrl: string | null;
  status: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface VendorBootstrapDto extends CatalogVersionDto {
  categories: unknown[];
  families: VendorBootstrapFamilyDto[];
  series: VendorBootstrapSeriesDto[];
  products: VendorBootstrapProductDto[];
}
