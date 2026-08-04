import { ActivityAction } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';
import { rateCatalogCacheService } from '../rate-catalog/rate-catalog.cache.js';
import type { UpdateFlexPricingInput } from './admin-pricing-spine.validation.js';

export class AdminFlexPricingService {
  async get(versionId: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: versionId },
      select: {
        ratePerSqFt: true,
        rollWidthOptions: { where: { isActive: true }, orderBy: { widthFeet: 'asc' } },
      },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    return {
      ratePerSqFt: version.ratePerSqFt != null ? decimalToNumber(version.ratePerSqFt) : null,
      widthsFeet: version.rollWidthOptions.map((w) => decimalToNumber(w.widthFeet)),
    };
  }

  /** Replaces the whole roll-width set and rate in one call — the set is small and edited as a unit. */
  async update(input: UpdateFlexPricingInput, actorId: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { productOfferingId: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    await prisma.$transaction(async (tx) => {
      await tx.productOfferingVersion.update({
        where: { id: input.versionId },
        data: { ratePerSqFt: toDecimal(input.ratePerSqFt) },
      });

      await tx.rollWidthOption.deleteMany({ where: { productOfferingVersionId: input.versionId } });
      await tx.rollWidthOption.createMany({
        data: input.widthsFeet.map((widthFeet) => ({
          productOfferingVersionId: input.versionId,
          widthFeet: toDecimal(widthFeet),
        })),
      });
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: { versionId: input.versionId, area: 'flex_pricing' },
    });
    pricingRepository.invalidateVersion(input.versionId);
    void rateCatalogCacheService.invalidateProduct(version.productOfferingId);

    return this.get(input.versionId);
  }
}

export const adminFlexPricingService = new AdminFlexPricingService();
