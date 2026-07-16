import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { decimalToNumber, toDecimal } from '../../utils/money.js';
import { calculatePriceFromBundle } from './pricing.calculator.js';
import { pricingRepository, VERSION_PRICING_INCLUDE } from '../../repositories/pricing.repository.js';
import type { PriceCalculationInput, PriceCalculationResult } from './pricing.types.js';

export { VERSION_PRICING_INCLUDE };

export class PricingEngineService {
  async loadVersionBundle(versionId: string) {
    const version = await pricingRepository.loadVersionBundle(versionId);
    if (!version) {
      throw ApiError.notFound('Product version not found');
    }
    return version;
  }

  async calculate(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    return pricingRepository.calculate(input);
  }

  async calculateForProduct(
    productId: string,
    quantity: number,
    selections: PriceCalculationInput['selections'],
    context?: PriceCalculationInput['context'],
  ): Promise<PriceCalculationResult> {
    const offering = await prisma.productOffering.findFirst({
      where: { id: productId, deletedAt: null, isActive: true },
      include: {
        versions: {
          where: { isCurrent: true, deletedAt: null },
          take: 1,
          include: VERSION_PRICING_INCLUDE,
        },
      },
    });

    if (!offering?.versions[0]) {
      throw ApiError.notFound('Product not found or has no published version');
    }

    return calculatePriceFromBundle(offering.versions[0], {
      versionId: offering.versions[0].id,
      quantity,
      selections,
      context,
    });
  }

  async persistSnapshot(result: PriceCalculationResult) {
    return prisma.priceSnapshot.create({
      data: {
        subtotal: toDecimal(result.subtotal),
        adjustmentTotal: toDecimal(result.adjustmentTotal),
        discountTotal: toDecimal(result.discountTotal),
        taxTotal: toDecimal(result.taxTotal),
        grandTotal: toDecimal(result.grandTotal),
        calculation: result.snapshotPayload as Prisma.InputJsonValue,
      },
    });
  }

  async previewWithSnapshot(input: PriceCalculationInput) {
    const result = await this.calculate(input);
    const snapshot = await this.persistSnapshot(result);
    return {
      ...result,
      snapshotId: snapshot.id,
      formattedTotal: new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
      }).format(result.grandTotal),
    };
  }

  mapQuantityTier(tier: { quantity: number; basePrice: { toNumber(): number }; id: string }) {
    return {
      id: tier.id,
      quantity: tier.quantity,
      basePrice: decimalToNumber(tier.basePrice as import('@prisma/client').Prisma.Decimal),
    };
  }
}

export const pricingEngineService = new PricingEngineService();
