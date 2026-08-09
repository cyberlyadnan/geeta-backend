import { ActivityAction, OptionPricingStrategy, PricingAdjustmentType, type Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { toDecimal } from '../../utils/money.js';
import type { CreateAttributeInput, UpdateAttributeInput } from './admin-products.validation.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';
import { rateCatalogCacheService } from '../rate-catalog/rate-catalog.cache.js';
import { mapOptionPricingDto } from './option-pricing.mapper.js';

type AttributeValueInput = NonNullable<CreateAttributeInput['values']>[number];

function normalizeOptionPricing(
  value: Partial<AttributeValueInput>,
): {
  pricingStrategy: OptionPricingStrategy;
  adjustmentType: PricingAdjustmentType;
  adjustmentValue: Prisma.Decimal;
  strategyConfig: Prisma.InputJsonValue;
  quantityTiers: Array<{ quantity: number; price: Prisma.Decimal; isActive?: boolean }>;
} | null {
  const hasLegacyAdjustment = value.adjustmentType != null && value.adjustmentValue != null;
  const hasStrategy = value.pricingStrategy != null;
  const hasTierRows = (value.quantityTiers?.length ?? 0) > 0;
  const hasStrategyConfig = value.strategyConfig != null;

  if (!hasLegacyAdjustment && !hasStrategy && !hasTierRows && !hasStrategyConfig) {
    return null;
  }

  const pricingStrategy = value.pricingStrategy
    ?? (hasTierRows ? OptionPricingStrategy.QUANTITY_BASED : (value.adjustmentType === PricingAdjustmentType.PERCENTAGE
      ? OptionPricingStrategy.PERCENTAGE
      : OptionPricingStrategy.FIXED));

  const adjustmentType = value.adjustmentType
    ?? (pricingStrategy === OptionPricingStrategy.PERCENTAGE
      ? PricingAdjustmentType.PERCENTAGE
      : PricingAdjustmentType.FIXED);

  return {
    pricingStrategy,
    adjustmentType,
    adjustmentValue: toDecimal(value.adjustmentValue ?? 0),
    strategyConfig: (value.strategyConfig ?? {}) as Prisma.InputJsonValue,
    quantityTiers: (value.quantityTiers ?? []).map((tier) => ({
      quantity: tier.quantity,
      price: toDecimal(tier.price),
      isActive: tier.isActive,
    })),
  };
}

async function upsertOptionPricing(
  tx: Prisma.TransactionClient,
  optionId: string,
  value: Partial<AttributeValueInput>,
) {
  const normalized = normalizeOptionPricing(value);
  if (!normalized) {
    await tx.configurationOptionPricing.deleteMany({ where: { optionId } });
    return;
  }

  const pricing = await tx.configurationOptionPricing.upsert({
    where: { optionId },
    create: {
      optionId,
      pricingStrategy: normalized.pricingStrategy,
      adjustmentType: normalized.adjustmentType,
      adjustmentValue: normalized.adjustmentValue,
      strategyConfig: normalized.strategyConfig,
    },
    update: {
      pricingStrategy: normalized.pricingStrategy,
      adjustmentType: normalized.adjustmentType,
      adjustmentValue: normalized.adjustmentValue,
      strategyConfig: normalized.strategyConfig,
      isActive: true,
    },
  });

  await tx.configurationOptionQuantityPricing.deleteMany({
    where: { optionPricingId: pricing.id },
  });

  if (normalized.quantityTiers.length > 0) {
    await tx.configurationOptionQuantityPricing.createMany({
      data: normalized.quantityTiers.map((tier) => ({
        optionPricingId: pricing.id,
        quantity: tier.quantity,
        price: tier.price,
        isActive: tier.isActive ?? true,
      })),
    });
  }
}

/**
 * Only one question per version can stand in for the product name, so promoting one demotes the
 * rest. Enforced in the same transaction as the write rather than by a partial unique index,
 * because "exactly one true per version, or none" is not expressible as a plain constraint.
 */
async function clearOtherPrimaries(
  tx: Prisma.TransactionClient,
  versionId: string,
  keepFieldId: string,
): Promise<void> {
  await tx.configurationField.updateMany({
    where: { productOfferingVersionId: versionId, isPrimary: true, id: { not: keepFieldId } },
    data: { isPrimary: false },
  });
}

export class AdminAttributesService {
  async list(versionId: string) {
    const fields = await prisma.configurationField.findMany({
      where: { productOfferingVersionId: versionId },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { pricing: { include: { quantityTiers: { orderBy: { quantity: 'asc' } } } } },
        },
      },
    });

    return fields.map((f) => ({
      id: f.id,
      code: f.code,
      label: f.label,
      description: f.description,
      fieldType: f.fieldType,
      placeholder: f.placeholder,
      isRequired: f.isRequired,
      isVisible: f.isVisible,
      isPrimary: f.isPrimary,
      sortOrder: f.sortOrder,
      values: f.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        isDefault: o.isDefault,
        pricing: mapOptionPricingDto(o.pricing),
      })),
    }));
  }

  async create(input: CreateAttributeInput, actorId: string, productId?: string) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { id: true, productOfferingId: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    const field = await prisma.$transaction(async (tx) => {
      const created = await tx.configurationField.create({
        data: {
          productOfferingVersionId: input.versionId,
          code: input.code,
          label: input.label,
          fieldType: input.fieldType,
          isRequired: input.isRequired ?? false,
          isVisible: input.isVisible ?? true,
          isPrimary: input.isPrimary ?? false,
          description: input.description,
          placeholder: input.placeholder,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      if (input.isPrimary) await clearOtherPrimaries(tx, input.versionId, created.id);

      for (const val of input.values ?? []) {
        const option = await tx.configurationOption.create({
          data: {
            fieldId: created.id,
            label: val.label,
            value: val.value,
            sortOrder: val.sortOrder ?? 0,
          },
        });
        await upsertOptionPricing(tx, option.id, val);
      }

      return created;
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_ATTRIBUTE_ADDED,
      productId: productId ?? version.productOfferingId,
      actorId,
      metadata: { fieldId: field.id, code: input.code },
    });

    return this.getById(field.id);
  }

  async getById(id: string) {
    const field = await prisma.configurationField.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { pricing: { include: { quantityTiers: { orderBy: { quantity: 'asc' } } } } },
        },
        productOfferingVersion: { select: { productOfferingId: true } },
      },
    });
    if (!field) throw ApiError.notFound('Attribute not found');

    return {
      id: field.id,
      versionId: field.productOfferingVersionId,
      productId: field.productOfferingVersion.productOfferingId,
      code: field.code,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      sortOrder: field.sortOrder,
      values: field.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        isDefault: o.isDefault,
        pricing: mapOptionPricingDto(o.pricing),
      })),
    };
  }

  async update(id: string, input: UpdateAttributeInput, actorId: string) {
    const existing = await prisma.configurationField.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Attribute not found');

    await prisma.$transaction(async (tx) => {
      await tx.configurationField.update({
        where: { id },
        data: {
          ...(input.code != null && { code: input.code }),
          ...(input.label != null && { label: input.label }),
          ...(input.fieldType != null && { fieldType: input.fieldType }),
          ...(input.isRequired != null && { isRequired: input.isRequired }),
          ...(input.isVisible != null && { isVisible: input.isVisible }),
          ...(input.isPrimary != null && { isPrimary: input.isPrimary }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.placeholder !== undefined && { placeholder: input.placeholder }),
          ...(input.sortOrder != null && { sortOrder: input.sortOrder }),
        },
      });

      if (input.isPrimary) {
        await clearOtherPrimaries(tx, existing.productOfferingVersionId, id);
      }

      if (input.values) {
        const seenIds = new Set<string>();

        for (const [index, value] of input.values.entries()) {
          const option = value.id
            ? await tx.configurationOption.update({
                where: { id: value.id },
                data: {
                  label: value.label,
                  value: value.value,
                  sortOrder: value.sortOrder ?? index,
                  isActive: value.isActive ?? true,
                  isDefault: value.isDefault ?? false,
                },
              })
            : await tx.configurationOption.create({
                data: {
                  fieldId: id,
                  label: value.label,
                  value: value.value,
                  sortOrder: value.sortOrder ?? index,
                  isActive: value.isActive ?? true,
                  isDefault: value.isDefault ?? false,
                },
              });

          seenIds.add(option.id);
          await upsertOptionPricing(tx, option.id, value);
        }

        await tx.configurationOption.deleteMany({
          where: {
            fieldId: id,
            ...(seenIds.size > 0 ? { id: { notIn: [...seenIds] } } : {}),
          },
        });
      }
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_UPDATED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { attributeId: id, ...input },
    });

    pricingRepository.invalidateVersion(existing.productOfferingVersionId);
    void rateCatalogCacheService.invalidateProduct(existing.productOfferingVersion.productOfferingId);

    return this.getById(id);
  }

  async delete(id: string, actorId: string) {
    const existing = await prisma.configurationField.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Attribute not found');

    await prisma.configurationField.delete({ where: { id } });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_ATTRIBUTE_REMOVED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { attributeId: id, code: existing.code },
    });

    return { id, deleted: true };
  }
}

export const adminAttributesService = new AdminAttributesService();
