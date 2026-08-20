import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { decimalToNumber } from '../../utils/money.js';
import { vendorVisibilityFilter } from './vendor-catalog.filters.js';

/**
 * Products whose price is a single fixed amount per design rather than a configured calculation
 * — wedding cards and the like. The vendor picks a design by looking at it, so these get a
 * gallery instead of the configuration wizard's option grid.
 */
const CATALOG_STRATEGY = 'fixed_catalog';

const CURRENT_CATALOG_VERSION = {
  isCurrent: true,
  deletedAt: null,
  productTypeProfile: { pricingStrategyKey: CATALOG_STRATEGY },
} as const;

export class VendorGalleryService {
  /**
   * The browse grid: every catalogue design with its cover image and price. `familyId` scopes
   * this to one family's designs — used when the gallery is embedded as an order-wizard step
   * rather than browsed as the standalone /vendor/catalogue page.
   */
  async list(search?: string, familyId?: string) {
    const products = await prisma.productOffering.findMany({
      where: {
        ...vendorVisibilityFilter(),
        versions: { some: CURRENT_CATALOG_VERSION },
        ...(familyId ? { series: { familyId } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { displayName: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        displayName: true,
        shortDescription: true,
        thumbnailUrl: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { imageUrl: true, altText: true } },
        versions: {
          where: CURRENT_CATALOG_VERSION,
          take: 1,
          select: { id: true, fixedPrice: true },
        },
      },
    });

    return {
      items: products
        // A version is guaranteed by the `some` filter, but the select is still typed optional.
        .filter((p) => p.versions[0])
        .map((p) => ({
          id: p.id,
          name: p.displayName ?? p.name,
          shortDescription: p.shortDescription,
          coverImageUrl: p.images[0]?.imageUrl ?? p.thumbnailUrl ?? null,
          versionId: p.versions[0]!.id,
          fixedPrice:
            p.versions[0]!.fixedPrice != null ? decimalToNumber(p.versions[0]!.fixedPrice) : null,
        })),
    };
  }

  /** One design, with every image so the vendor can look before committing. */
  async detail(productId: string) {
    const product = await prisma.productOffering.findFirst({
      where: { id: productId, ...vendorVisibilityFilter() },
      select: {
        id: true,
        name: true,
        displayName: true,
        shortDescription: true,
        description: true,
        thumbnailUrl: true,
        sku: true,
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, imageUrl: true, altText: true, isThumbnail: true },
        },
        versions: {
          where: CURRENT_CATALOG_VERSION,
          take: 1,
          select: {
            id: true,
            fixedPrice: true,
            productTypeProfile: { select: { designServiceMode: true } },
            // Catalogue designs skip the configuration wizard (price is fixed), so these fields
            // are read-only spec sheet entries rather than interactive choices — each one's
            // default option is simply "what this design comes with" (size, cover, lamination,
            // MOQ, etc). Fully data-driven: a new spec is a new field row, never a code change.
            configurationFields: {
              where: { isVisible: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                label: true,
                options: {
                  where: { isActive: true },
                  orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
                  take: 1,
                  select: { label: true },
                },
              },
            },
          },
        },
      },
    });

    if (!product) throw ApiError.notFound('Design not found');
    const version = product.versions[0];
    if (!version) throw ApiError.notFound('This product is not a catalogue design');

    return {
      id: product.id,
      name: product.displayName ?? product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      orderCode: product.sku,
      images: product.images.map((i) => ({
        id: i.id,
        url: i.imageUrl,
        alt: i.altText,
      })),
      versionId: version.id,
      fixedPrice: version.fixedPrice != null ? decimalToNumber(version.fixedPrice) : null,
      designServiceMode: version.productTypeProfile?.designServiceMode ?? 'NOT_OFFERED',
      specs: version.configurationFields
        .filter((f) => f.options[0])
        .map((f) => ({ label: f.label, value: f.options[0]!.label })),
    };
  }
}

export const vendorGalleryService = new VendorGalleryService();
