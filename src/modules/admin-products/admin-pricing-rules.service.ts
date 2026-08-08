import { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import type {
  CreatePricingRuleInput,
  UpdatePricingRuleInput,
  UpsertQuantityTierInput,
} from './admin-products.validation.js';
import { rateCatalogCacheService } from '../rate-catalog/rate-catalog.cache.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';
import { migrateMatrixBands, readBandLabels } from './quantity-band-migration.js';

export class AdminPricingRulesService {
  async list(versionId: string) {
    const [rules, tiers] = await Promise.all([
      prisma.pricingRule.findMany({
        where: { productOfferingVersionId: versionId },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
      prisma.quantityPricing.findMany({
        where: { productOfferingVersionId: versionId },
        orderBy: { quantity: 'asc' },
      }),
    ]);

    return {
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        configurationFieldId: r.configurationFieldId,
        configurationOptionId: r.configurationOptionId,
        adjustmentType: r.adjustmentType,
        adjustmentValue: decimalToNumber(r.adjustmentValue),
        priority: r.priority,
        status: r.status,
        condition: r.condition,
      })),
      quantityTiers: tiers.map((t) => ({
        id: t.id,
        quantity: t.quantity,
        basePrice: decimalToNumber(t.basePrice),
        isActive: t.isActive,
      })),
    };
  }

  async createRule(input: CreatePricingRuleInput, actorId: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { productOfferingId: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    const rule = await prisma.pricingRule.create({
      data: {
        productOfferingVersionId: input.versionId,
        name: input.name,
        description: input.description,
        configurationFieldId: input.configurationFieldId,
        configurationOptionId: input.configurationOptionId,
        adjustmentType: input.adjustmentType,
        adjustmentValue: toDecimal(input.adjustmentValue),
        priority: input.priority ?? 0,
        status: input.status ?? 'ACTIVE',
        condition: (input.condition ?? {}) as Prisma.InputJsonValue,
      },
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: { ruleId: rule.id, action: 'created' },
    });

    pricingRepository.invalidateVersion(input.versionId);
    void rateCatalogCacheService.invalidateProduct(version.productOfferingId);

    return {
      id: rule.id,
      name: rule.name,
      adjustmentType: rule.adjustmentType,
      adjustmentValue: decimalToNumber(rule.adjustmentValue),
      priority: rule.priority,
      status: rule.status,
    };
  }

  async updateRule(id: string, input: UpdatePricingRuleInput, actorId: string) {
    const existing = await prisma.pricingRule.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Pricing rule not found');

    const rule = await prisma.pricingRule.update({
      where: { id },
      data: {
        ...(input.name != null && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.configurationFieldId !== undefined && { configurationFieldId: input.configurationFieldId }),
        ...(input.configurationOptionId !== undefined && { configurationOptionId: input.configurationOptionId }),
        ...(input.adjustmentType != null && { adjustmentType: input.adjustmentType }),
        ...(input.adjustmentValue != null && { adjustmentValue: toDecimal(input.adjustmentValue) }),
        ...(input.priority != null && { priority: input.priority }),
        ...(input.status != null && { status: input.status }),
        ...(input.condition !== undefined && { condition: input.condition as Prisma.InputJsonValue }),
      },
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { ruleId: id, action: 'updated' },
    });

    pricingRepository.invalidateVersion(existing.productOfferingVersionId);
    void rateCatalogCacheService.invalidateProduct(existing.productOfferingVersion.productOfferingId);

    return {
      id: rule.id,
      name: rule.name,
      adjustmentType: rule.adjustmentType,
      adjustmentValue: decimalToNumber(rule.adjustmentValue),
      priority: rule.priority,
      status: rule.status,
    };
  }

  async deleteRule(id: string, actorId: string) {
    const existing = await prisma.pricingRule.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Pricing rule not found');

    await prisma.pricingRule.delete({ where: { id } });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { ruleId: id, action: 'deleted' },
    });

    pricingRepository.invalidateVersion(existing.productOfferingVersionId);
    void rateCatalogCacheService.invalidateProduct(existing.productOfferingVersion.productOfferingId);

    return { id, deleted: true };
  }

  /**
   * Edits a tier in place, including its quantity. Kept separate from the create path because the
   * table's natural key is (version, quantity): upserting a renamed tier would silently leave the
   * old row behind and add a second one, which is what the admin screen used to do.
   */
  private async updateExistingTier(tx: Prisma.TransactionClient, input: UpsertQuantityTierInput & { id: string }) {
    const existing = await tx.quantityPricing.findUnique({ where: { id: input.id } });
    if (existing?.productOfferingVersionId !== input.versionId) {
      throw ApiError.notFound('Quantity tier not found');
    }

    if (existing.quantity !== input.quantity) {
      const clash = await tx.quantityPricing.findUnique({
        where: {
          productOfferingVersionId_quantity: {
            productOfferingVersionId: input.versionId,
            quantity: input.quantity,
          },
        },
      });
      if (clash) {
        throw ApiError.badRequest(
          `This product already has a quantity tier starting at ${String(input.quantity)}. Edit or remove that tier instead.`,
        );
      }
    }

    return tx.quantityPricing.update({
      where: { id: input.id },
      data: { quantity: input.quantity, basePrice: toDecimal(input.basePrice), isActive: true },
    });
  }

  async upsertQuantityTier(input: UpsertQuantityTierInput, actorId: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { productOfferingId: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    // Tier write and band migration share one transaction: a half-applied rename would leave the
    // price table pointing at bands that no longer exist.
    const { tier, bands } = await prisma.$transaction(async (tx) => {
      const before = await readBandLabels(tx, input.versionId);

      const saved = input.id
        ? await this.updateExistingTier(tx, input as UpsertQuantityTierInput & { id: string })
        : await tx.quantityPricing.upsert({
            where: {
              productOfferingVersionId_quantity: {
                productOfferingVersionId: input.versionId,
                quantity: input.quantity,
              },
            },
            create: {
              productOfferingVersionId: input.versionId,
              quantity: input.quantity,
              basePrice: toDecimal(input.basePrice),
            },
            update: {
              basePrice: toDecimal(input.basePrice),
              isActive: true,
            },
          });

      const after = await readBandLabels(tx, input.versionId);
      return { tier: saved, bands: await migrateMatrixBands(tx, input.versionId, before, after) };
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: { quantityTierId: tier.id, quantity: input.quantity, bands },
    });

    pricingRepository.invalidateVersion(input.versionId);
    void rateCatalogCacheService.invalidateProduct(version.productOfferingId);

    return {
      id: tier.id,
      quantity: tier.quantity,
      basePrice: decimalToNumber(tier.basePrice),
      isActive: tier.isActive,
      bands,
    };
  }

  async deleteQuantityTier(id: string, actorId: string) {
    const existing = await prisma.quantityPricing.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Quantity tier not found');

    const versionId = existing.productOfferingVersionId;
    const bands = await prisma.$transaction(async (tx) => {
      const before = await readBandLabels(tx, versionId);
      await tx.quantityPricing.delete({ where: { id } });
      const after = await readBandLabels(tx, versionId);
      return migrateMatrixBands(tx, versionId, before, after);
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { quantityTierId: id, action: 'deleted', bands },
    });

    pricingRepository.invalidateVersion(versionId);
    void rateCatalogCacheService.invalidateProduct(existing.productOfferingVersion.productOfferingId);

    return { id, deleted: true, bands };
  }
}

export const adminPricingRulesService = new AdminPricingRulesService();
