import { ActivityAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { toDecimal, decimalToNumber } from '../../utils/money.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';
import { rateCatalogCacheService } from '../rate-catalog/rate-catalog.cache.js';
import {
  buildDimensionKeyHash,
  buildQuantityBands,
} from '../../services/pricing-engine/matrix-pricing.resolver.js';
import type {
  CreateModifierRuleInput,
  SaveMatrixCellsInput,
  UpdateModifierRuleInput,
} from './admin-pricing-spine.validation.js';

async function requireVersion(versionId: string) {
  const version = await prisma.productOfferingVersion.findUnique({
    where: { id: versionId },
    select: {
      productOfferingId: true,
      quantityPricing: { where: { isActive: true }, orderBy: { quantity: 'asc' } },
      configurationFields: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  if (!version) throw ApiError.notFound('Product version not found');
  return version;
}

function invalidateCaches(productOfferingId: string, versionId: string): void {
  pricingRepository.invalidateVersion(versionId);
  void rateCatalogCacheService.invalidateProduct(productOfferingId);
}

export class AdminPricingMatrixService {
  /** Everything the grid editor needs in one call: pickable dimension fields, quantity bands
   *  (reusing the exact same tier data the resolver bands off), existing cells, and modifier rules. */
  async list(versionId: string) {
    const version = await requireVersion(versionId);

    const [cells, modifierRules] = await Promise.all([
      prisma.priceMatrixCell.findMany({ where: { productOfferingVersionId: versionId } }),
      prisma.priceModifierRule.findMany({ where: { productOfferingVersionId: versionId } }),
    ]);

    const quantityBands = buildQuantityBands(version.quantityPricing);

    return {
      dimensionFields: version.configurationFields
        .filter((f) => f.options.length > 0)
        .map((f) => ({
          code: f.code,
          label: f.label,
          values: f.options.map((o) => ({ value: o.value, label: o.label })),
        })),
      quantityBands: quantityBands.map((b) => ({ label: b.label, lowerBound: b.lowerBound })),
      cells: cells.map((c) => ({
        id: c.id,
        dimensionKey: c.dimensionKey,
        price: c.price != null ? decimalToNumber(c.price) : null,
        available: c.available,
        unavailableReason: c.unavailableReason,
      })),
      modifierRules: modifierRules.map((r) => ({
        id: r.id,
        name: r.name,
        triggerField: r.triggerField,
        triggerValue: r.triggerValue,
        amountKey: r.amountKey,
        amountTable: r.amountTable,
        appliesAfter: r.appliesAfter,
      })),
    };
  }

  /** Bulk upsert — the grid is saved as a whole page, not cell-by-cell. */
  async saveCells(input: SaveMatrixCellsInput, actorId: string) {
    const version = await requireVersion(input.versionId);

    const saved = await prisma.$transaction(
      input.cells.map((cell) => {
        const dimensionKey: Record<string, string> = { ...cell.dimensionValues, qtyBand: cell.qtyBand };
        const dimensionKeyHash = buildDimensionKeyHash(dimensionKey);
        return prisma.priceMatrixCell.upsert({
          where: {
            productOfferingVersionId_dimensionKeyHash: {
              productOfferingVersionId: input.versionId,
              dimensionKeyHash,
            },
          },
          create: {
            productOfferingVersionId: input.versionId,
            dimensionKey: dimensionKey as Prisma.InputJsonValue,
            dimensionKeyHash,
            price: cell.price != null ? toDecimal(cell.price) : null,
            available: cell.available,
            unavailableReason: cell.unavailableReason ?? null,
          },
          update: {
            dimensionKey: dimensionKey as Prisma.InputJsonValue,
            price: cell.price != null ? toDecimal(cell.price) : null,
            available: cell.available,
            unavailableReason: cell.unavailableReason ?? null,
          },
        });
      }),
    );

    invalidateCaches(version.productOfferingId, input.versionId);
    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: { versionId: input.versionId, area: 'pricing_matrix', cellsSaved: saved.length },
    });

    return {
      cells: saved.map((c) => ({
        id: c.id,
        dimensionKey: c.dimensionKey,
        price: c.price != null ? decimalToNumber(c.price) : null,
        available: c.available,
        unavailableReason: c.unavailableReason,
      })),
    };
  }

  async deleteCell(id: string, actorId: string) {
    const existing = await prisma.priceMatrixCell.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Matrix cell not found');

    await prisma.priceMatrixCell.delete({ where: { id } });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { cellId: id, area: 'pricing_matrix', action: 'deleted' },
    });
    pricingRepository.invalidateVersion(existing.productOfferingVersionId);
    void rateCatalogCacheService.invalidateProduct(existing.productOfferingVersion.productOfferingId);

    return { id, deleted: true };
  }

  async createModifierRule(input: CreateModifierRuleInput, actorId: string) {
    const version = await requireVersion(input.versionId);

    const rule = await prisma.priceModifierRule.create({
      data: {
        productOfferingVersionId: input.versionId,
        name: input.name,
        triggerField: input.triggerField,
        triggerValue: input.triggerValue,
        amountKey: input.amountKey,
        amountTable: input.amountTable as Prisma.InputJsonValue,
        appliesAfter: input.appliesAfter ?? 'base',
      },
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: version.productOfferingId,
      actorId,
      metadata: { ruleId: rule.id, area: 'pricing_matrix', action: 'created' },
    });
    invalidateCaches(version.productOfferingId, input.versionId);
    return this.mapModifierRule(rule);
  }

  async updateModifierRule(id: string, input: UpdateModifierRuleInput, actorId: string) {
    const existing = await prisma.priceModifierRule.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Price modifier rule not found');

    const rule = await prisma.priceModifierRule.update({
      where: { id },
      data: {
        ...(input.name != null && { name: input.name }),
        ...(input.triggerField != null && { triggerField: input.triggerField }),
        ...(input.triggerValue != null && { triggerValue: input.triggerValue }),
        ...(input.amountKey != null && { amountKey: input.amountKey }),
        ...(input.amountTable != null && { amountTable: input.amountTable as Prisma.InputJsonValue }),
        ...(input.appliesAfter != null && { appliesAfter: input.appliesAfter }),
      },
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { ruleId: id, area: 'pricing_matrix', action: 'updated' },
    });
    invalidateCaches(existing.productOfferingVersion.productOfferingId, existing.productOfferingVersionId);
    return this.mapModifierRule(rule);
  }

  async deleteModifierRule(id: string, actorId: string) {
    const existing = await prisma.priceModifierRule.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Price modifier rule not found');

    await prisma.priceModifierRule.delete({ where: { id } });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_PRICING_CHANGED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { ruleId: id, area: 'pricing_matrix', action: 'deleted' },
    });
    pricingRepository.invalidateVersion(existing.productOfferingVersionId);
    void rateCatalogCacheService.invalidateProduct(existing.productOfferingVersion.productOfferingId);

    return { id, deleted: true };
  }

  private mapModifierRule(rule: {
    id: string;
    name: string;
    triggerField: string;
    triggerValue: string;
    amountKey: string;
    amountTable: Prisma.JsonValue;
    appliesAfter: string;
  }) {
    return {
      id: rule.id,
      name: rule.name,
      triggerField: rule.triggerField,
      triggerValue: rule.triggerValue,
      amountKey: rule.amountKey,
      amountTable: rule.amountTable,
      appliesAfter: rule.appliesAfter,
    };
  }
}

export const adminPricingMatrixService = new AdminPricingMatrixService();
