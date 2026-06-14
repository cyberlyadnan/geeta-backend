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

    return { id, deleted: true };
  }

  async upsertQuantityTier(input: UpsertQuantityTierInput, actorId: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { productOfferingId: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    const tier = await prisma.quantityPricing.upsert({
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

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: { quantityTierId: tier.id, quantity: input.quantity },
    });

    return {
      id: tier.id,
      quantity: tier.quantity,
      basePrice: decimalToNumber(tier.basePrice),
      isActive: tier.isActive,
    };
  }

  async deleteQuantityTier(id: string, actorId: string) {
    const existing = await prisma.quantityPricing.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Quantity tier not found');

    await prisma.quantityPricing.delete({ where: { id } });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { quantityTierId: id, action: 'deleted' },
    });

    return { id, deleted: true };
  }
}

export const adminPricingRulesService = new AdminPricingRulesService();
