import { ActivityAction } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { vendorPriceOverrideRepository } from '../../repositories/vendor-price-override.repository.js';
import type {
  CreateVendorOverrideInput,
  ListVendorOverridesQuery,
} from './admin-pricing-spine.validation.js';

export class AdminVendorOverridesService {
  async list(query: ListVendorOverridesQuery) {
    const overrides = await prisma.vendorPriceOverride.findMany({
      where: {
        productOfferingVersionId: query.versionId,
        ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      },
      include: {
        vendor: { select: { id: true, firstName: true, lastName: true, email: true } },
        matrixCell: { select: { id: true, dimensionKey: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return overrides.map((o) => ({
      id: o.id,
      vendor: { id: o.vendor.id, name: `${o.vendor.firstName} ${o.vendor.lastName}`, email: o.vendor.email },
      matrixCellId: o.matrixCellId,
      matrixCellDimensionKey: o.matrixCell?.dimensionKey ?? null,
      overrideType: o.overrideType,
      value: decimalToNumber(o.value),
      createdAt: o.createdAt,
    }));
  }

  /**
   * Every negotiated price one vendor holds, across the whole catalogue.
   *
   * The product-first listing above answers "who has a deal on this product"; an account manager
   * needs the other direction — "what has this vendor been promised" — which previously could only
   * be assembled by opening every product in turn. Each row carries the list price it departs from
   * and the resulting price, because a bare "-2" tells nobody what the vendor actually pays.
   */
  async listForVendor(vendorId: string) {
    const overrides = await prisma.vendorPriceOverride.findMany({
      where: { vendorId },
      include: {
        matrixCell: { select: { id: true, dimensionKey: true, price: true } },
        setByUser: { select: { firstName: true, lastName: true } },
        productOfferingVersion: {
          select: {
            id: true,
            versionLabel: true,
            fixedPrice: true,
            productOffering: { select: { id: true, name: true, sku: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return overrides.map((o) => {
      const listPrice = o.matrixCell?.price
        ? decimalToNumber(o.matrixCell.price)
        : o.productOfferingVersion.fixedPrice
          ? decimalToNumber(o.productOfferingVersion.fixedPrice)
          : null;
      const value = decimalToNumber(o.value);
      // REPLACE substitutes the price outright; DELTA adds to it, so a negative DELTA is a discount.
      const effectivePrice =
        o.overrideType === 'REPLACE' ? value : listPrice != null ? listPrice + value : null;

      return {
        id: o.id,
        product: {
          id: o.productOfferingVersion.productOffering.id,
          name: o.productOfferingVersion.productOffering.name,
          sku: o.productOfferingVersion.productOffering.sku,
        },
        versionId: o.productOfferingVersion.id,
        versionLabel: o.productOfferingVersion.versionLabel,
        matrixCellId: o.matrixCellId,
        matrixCellDimensionKey: o.matrixCell?.dimensionKey ?? null,
        overrideType: o.overrideType,
        value,
        listPrice,
        effectivePrice,
        /** Negative means the vendor pays less than list — what an admin scans the table for. */
        discountAmount:
          listPrice != null && effectivePrice != null ? effectivePrice - listPrice : null,
        setBy: `${o.setByUser.firstName} ${o.setByUser.lastName}`.trim(),
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });
  }

  async create(input: CreateVendorOverrideInput, actorId: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { productOfferingId: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    if (input.matrixCellId) {
      const cell = await prisma.priceMatrixCell.findUnique({ where: { id: input.matrixCellId } });
      if (!cell || cell.productOfferingVersionId !== input.versionId) {
        throw ApiError.badRequest('Matrix cell does not belong to this product version');
      }
    }

    const existing = await prisma.vendorPriceOverride.findFirst({
      where: {
        vendorId: input.vendorId,
        productOfferingVersionId: input.versionId,
        matrixCellId: input.matrixCellId ?? null,
      },
    });

    const override = existing
      ? await prisma.vendorPriceOverride.update({
          where: { id: existing.id },
          data: { overrideType: input.overrideType, value: toDecimal(input.value), setByUserId: actorId },
        })
      : await prisma.vendorPriceOverride.create({
          data: {
            vendorId: input.vendorId,
            productOfferingVersionId: input.versionId,
            matrixCellId: input.matrixCellId ?? null,
            overrideType: input.overrideType,
            value: toDecimal(input.value),
            setByUserId: actorId,
          },
        });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: {
        versionId: input.versionId,
        area: 'vendor_override',
        vendorId: input.vendorId,
        matrixCellId: input.matrixCellId ?? null,
      },
    });
    await vendorPriceOverrideRepository.invalidateForVendor(input.vendorId, input.versionId);

    return {
      id: override.id,
      vendorId: override.vendorId,
      matrixCellId: override.matrixCellId,
      overrideType: override.overrideType,
      value: decimalToNumber(override.value),
    };
  }

  async delete(id: string, actorId: string) {
    const existing = await prisma.vendorPriceOverride.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Vendor price override not found');

    await prisma.vendorPriceOverride.delete({ where: { id } });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: {
        versionId: existing.productOfferingVersionId,
        area: 'vendor_override',
        vendorId: existing.vendorId,
        action: 'deleted',
      },
    });
    await vendorPriceOverrideRepository.invalidateForVendor(existing.vendorId, existing.productOfferingVersionId);

    return { id, deleted: true };
  }
}

export const adminVendorOverridesService = new AdminVendorOverridesService();
