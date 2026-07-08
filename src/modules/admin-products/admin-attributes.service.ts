import { ActivityAction } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { toDecimal } from '../../utils/money.js';
import type { CreateAttributeInput, UpdateAttributeInput } from './admin-products.validation.js';

export class AdminAttributesService {
  async list(versionId: string) {
    const fields = await prisma.configurationField.findMany({
      where: { productOfferingVersionId: versionId },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
          include: { pricing: true },
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
      sortOrder: f.sortOrder,
      values: f.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
        isDefault: o.isDefault,
        pricing: o.pricing
          ? {
              adjustmentType: o.pricing.adjustmentType,
              adjustmentValue: Number(o.pricing.adjustmentValue),
              isActive: o.pricing.isActive,
            }
          : null,
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
          description: input.description,
          placeholder: input.placeholder,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      for (const val of input.values ?? []) {
        const option = await tx.configurationOption.create({
          data: {
            fieldId: created.id,
            label: val.label,
            value: val.value,
            sortOrder: val.sortOrder ?? 0,
          },
        });
        if (val.adjustmentType != null && val.adjustmentValue != null) {
          await tx.configurationOptionPricing.create({
            data: {
              optionId: option.id,
              adjustmentType: val.adjustmentType,
              adjustmentValue: toDecimal(val.adjustmentValue),
            },
          });
        }
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
        options: { orderBy: { sortOrder: 'asc' }, include: { pricing: true } },
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
        pricing: o.pricing
          ? {
              adjustmentType: o.pricing.adjustmentType,
              adjustmentValue: Number(o.pricing.adjustmentValue),
              isActive: o.pricing.isActive,
            }
          : null,
      })),
    };
  }

  async update(id: string, input: UpdateAttributeInput, actorId: string) {
    const existing = await prisma.configurationField.findUnique({
      where: { id },
      include: { productOfferingVersion: { select: { productOfferingId: true } } },
    });
    if (!existing) throw ApiError.notFound('Attribute not found');

    await prisma.configurationField.update({
      where: { id },
      data: {
        ...(input.code != null && { code: input.code }),
        ...(input.label != null && { label: input.label }),
        ...(input.fieldType != null && { fieldType: input.fieldType }),
        ...(input.isRequired != null && { isRequired: input.isRequired }),
        ...(input.isVisible != null && { isVisible: input.isVisible }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.placeholder !== undefined && { placeholder: input.placeholder }),
        ...(input.sortOrder != null && { sortOrder: input.sortOrder }),
      },
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_UPDATED,
      productId: existing.productOfferingVersion.productOfferingId,
      actorId,
      metadata: { attributeId: id, ...input },
    });

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
