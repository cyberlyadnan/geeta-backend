import { Prisma, ProductStatus, ProductVisibility } from '@prisma/client';

/** Products vendors can browse/order. */
export function vendorVisibilityFilter(): Prisma.ProductOfferingWhereInput {
  return {
    deletedAt: null,
    isActive: true,
    status: ProductStatus.ACTIVE,
    visibility: { in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY] },
    versions: {
      some: { isCurrent: true, deletedAt: null },
    },
  };
}

/** Lighter filter for family/series product counts. */
export function catalogOfferingCountFilter(): Prisma.ProductOfferingWhereInput {
  return {
    deletedAt: null,
    isActive: true,
    status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
    visibility: {
      in: [ProductVisibility.PUBLIC, ProductVisibility.VENDOR_ONLY, ProductVisibility.HIDDEN],
    },
  };
}

export const VENDOR_FAMILY_WHERE: Prisma.ProductFamilyWhereInput = {
  deletedAt: null,
  isActive: true,
  status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
};

export const VENDOR_SERIES_WHERE: Prisma.ProductSeriesWhereInput = {
  deletedAt: null,
  isActive: true,
  status: { in: [ProductStatus.ACTIVE, ProductStatus.DRAFT] },
};
