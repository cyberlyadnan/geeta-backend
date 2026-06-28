import {
  ActivityAction,
  Prisma,
  ProductOfferingVersionStatus,
  ProductStatus,
  ProductVisibility,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { catalogAuditService } from '../../services/catalog/catalog-audit.service.js';
import { pricingEngineService } from '../../services/pricing-engine/index.js';
import { uniqueSlug } from '../../utils/slug.js';
import { toDecimal } from '../../utils/money.js';
import type {
  CalculatePriceInput,
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from './admin-products.validation.js';
import { mapProductDetailToDto, mapProductListItemToDto } from './admin-products.serialization.js';

const PRODUCT_LIST_INCLUDE = {
  series: {
    include: {
      family: { include: { category: { include: { parent: true } } } },
    },
  },
  versions: {
    where: { isCurrent: true, deletedAt: null },
    take: 1,
    select: { id: true, versionNumber: true, status: true },
  },
  images: { orderBy: { sortOrder: 'asc' }, take: 3 },
  _count: { select: { versions: true, images: true } },
} satisfies Prisma.ProductOfferingInclude;

const PRODUCT_DETAIL_INCLUDE = {
  series: {
    include: {
      family: { include: { category: { include: { parent: true } } } },
    },
  },
  versions: {
    where: { deletedAt: null },
    orderBy: { versionNumber: 'desc' },
    include: {
      quantityPricing: { orderBy: { quantity: 'asc' } },
      configurationFields: {
        orderBy: { sortOrder: 'asc' },
        include: {
          options: {
            orderBy: { sortOrder: 'asc' },
            include: { pricing: true },
          },
        },
      },
      pricingRules: { orderBy: [{ priority: 'desc' }] },
    },
  },
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductOfferingInclude;

export class AdminProductsService {
  async list(query: ListProductsQuery) {
    const { page, limit, search, status, categoryId, visibility, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductOfferingWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(visibility && { visibility }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(categoryId && {
        series: { family: { categoryId } },
      }),
    };

    const [items, total] = await Promise.all([
      prisma.productOffering.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: PRODUCT_LIST_INCLUDE,
      }),
      prisma.productOffering.count({ where }),
    ]);

    return {
      items: items.map(mapProductListItemToDto),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getById(id: string, options?: { includeActivityLogs?: boolean }) {
    const product = await prisma.productOffering.findFirst({
      where: { id, deletedAt: null },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product) throw ApiError.notFound('Product not found');

    const dto = mapProductDetailToDto(product);
    if (options?.includeActivityLogs === false) {
      return dto;
    }

    const logs = await catalogAuditService.listProductAudit(id, 30);
    return { ...dto, activityLogs: logs };
  }

  private async resolveCategoryId(categoryId: string, subcategoryId?: string) {
    const leafId = subcategoryId ?? categoryId;
    const cat = await prisma.category.findFirst({
      where: { id: leafId, deletedAt: null },
    });
    if (!cat) throw ApiError.badRequest('Category not found');
    return cat.id;
  }

  private async ensureCatalogHierarchy(categoryId: string, productName: string) {
    const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });

    const familySlug = await uniqueSlug(
      `${category.slug}-family`,
      async (s) => !!(await prisma.productFamily.findUnique({ where: { slug: s } })),
    );

    let family = await prisma.productFamily.findFirst({
      where: { categoryId, slug: familySlug },
    });
    if (!family) {
      family = await prisma.productFamily.create({
        data: {
          categoryId,
          name: category.name,
          slug: familySlug,
          status: ProductStatus.ACTIVE,
        },
      });
    }

    const seriesSlug = await uniqueSlug(productName, async (s) =>
      !!(await prisma.productSeries.findUnique({ where: { slug: s } })),
    );

    const series = await prisma.productSeries.create({
      data: {
        familyId: family.id,
        name: productName,
        slug: seriesSlug,
        status: ProductStatus.ACTIVE,
      },
    });

    return series;
  }

  async create(input: CreateProductInput, actorId: string, meta?: { ipAddress?: string; userAgent?: string }) {
    const categoryId = await this.resolveCategoryId(input.categoryId, input.subcategoryId);
    const series = await this.ensureCatalogHierarchy(categoryId, input.name);

    const slug = await uniqueSlug(input.name, async (s) =>
      !!(await prisma.productOffering.findUnique({ where: { slug: s } })),
    );

    const product = await prisma.$transaction(async (tx) => {
      const offering = await tx.productOffering.create({
        data: {
          seriesId: series.id,
          name: input.name,
          slug,
          description: input.description,
          shortDescription: input.shortDescription,
          sku: input.sku,
          visibility: input.visibility ?? ProductVisibility.VENDOR_ONLY,
          status: input.status ?? ProductStatus.DRAFT,
          sortOrder: input.sortOrder ?? 0,
          isFeatured: input.isFeatured ?? false,
          thumbnailUrl: input.thumbnailUrl,
          thumbnailKey: input.thumbnailKey,
        },
      });

      const version = await tx.productOfferingVersion.create({
        data: {
          productOfferingId: offering.id,
          versionNumber: 1,
          versionLabel: 'v1',
          status: ProductOfferingVersionStatus.DRAFT,
          isCurrent: true,
        },
      });

      if (input.quantityTiers?.length) {
        await tx.quantityPricing.createMany({
          data: input.quantityTiers.map((t) => ({
            productOfferingVersionId: version.id,
            quantity: t.quantity,
            basePrice: toDecimal(t.basePrice),
          })),
        });
      }

      if (input.attributes?.length) {
        for (const attr of input.attributes) {
          const field = await tx.configurationField.create({
            data: {
              productOfferingVersionId: version.id,
              code: attr.code,
              label: attr.label,
              fieldType: attr.fieldType,
              isRequired: attr.isRequired ?? false,
              sortOrder: attr.sortOrder ?? 0,
            },
          });

          for (const val of attr.values ?? []) {
            const option = await tx.configurationOption.create({
              data: {
                fieldId: field.id,
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
        }
      }

      return offering;
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_CREATED,
      productId: product.id,
      actorId,
      metadata: { name: input.name, categoryId },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.getById(product.id);
  }

  async update(
    id: string,
    input: UpdateProductInput,
    actorId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ) {
    const existing = await prisma.productOffering.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound('Product not found');

    await prisma.productOffering.update({
      where: { id },
      data: {
        ...(input.name != null && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.shortDescription !== undefined && { shortDescription: input.shortDescription }),
        ...(input.sku !== undefined && { sku: input.sku }),
        ...(input.visibility != null && { visibility: input.visibility }),
        ...(input.status != null && { status: input.status }),
        ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
        ...(input.thumbnailKey !== undefined && { thumbnailKey: input.thumbnailKey }),
        ...(input.isActive != null && { isActive: input.isActive }),
        ...(input.isFeatured != null && { isFeatured: input.isFeatured }),
        ...(input.sortOrder != null && { sortOrder: input.sortOrder }),
      },
    });

    void catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_UPDATED,
      productId: id,
      actorId,
      metadata: input,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return this.getById(id, { includeActivityLogs: false });
  }

  async delete(id: string, actorId: string) {
    const existing = await prisma.productOffering.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw ApiError.notFound('Product not found');

    await prisma.productOffering.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: ProductStatus.ARCHIVED },
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_STATUS_CHANGED,
      productId: id,
      actorId,
      metadata: { status: 'ARCHIVED', softDeleted: true },
    });

    return { id, deleted: true };
  }

  async clone(id: string, actorId: string) {
    const source = await prisma.productOffering.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: {
          where: { isCurrent: true },
          take: 1,
          include: {
            quantityPricing: true,
            configurationFields: { include: { options: { include: { pricing: true } } } },
            pricingRules: true,
          },
        },
        images: true,
      },
    });
    if (!source?.versions[0]) throw ApiError.notFound('Product not found');

    const srcVersion = source.versions[0];
    const newName = `${source.name} (Copy)`;
    const slug = await uniqueSlug(newName, async (s) =>
      !!(await prisma.productOffering.findUnique({ where: { slug: s } })),
    );

    const cloned = await prisma.$transaction(async (tx) => {
      const offering = await tx.productOffering.create({
        data: {
          seriesId: source.seriesId,
          name: newName,
          slug,
          description: source.description,
          shortDescription: source.shortDescription,
          visibility: source.visibility,
          status: ProductStatus.DRAFT,
          thumbnailUrl: source.thumbnailUrl,
          thumbnailKey: source.thumbnailKey,
        },
      });

      const version = await tx.productOfferingVersion.create({
        data: {
          productOfferingId: offering.id,
          versionNumber: 1,
          versionLabel: 'v1',
          status: ProductOfferingVersionStatus.DRAFT,
          isCurrent: true,
        },
      });

      for (const tier of srcVersion.quantityPricing) {
        await tx.quantityPricing.create({
          data: {
            productOfferingVersionId: version.id,
            quantity: tier.quantity,
            basePrice: tier.basePrice,
            isActive: tier.isActive,
          },
        });
      }

      for (const field of srcVersion.configurationFields) {
        const newField = await tx.configurationField.create({
          data: {
            productOfferingVersionId: version.id,
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            sortOrder: field.sortOrder,
          },
        });
        for (const opt of field.options) {
          const newOpt = await tx.configurationOption.create({
            data: {
              fieldId: newField.id,
              label: opt.label,
              value: opt.value,
              sortOrder: opt.sortOrder,
            },
          });
          if (opt.pricing) {
            await tx.configurationOptionPricing.create({
              data: {
                optionId: newOpt.id,
                adjustmentType: opt.pricing.adjustmentType,
                adjustmentValue: opt.pricing.adjustmentValue,
              },
            });
          }
        }
      }

      for (const rule of srcVersion.pricingRules) {
        await tx.pricingRule.create({
          data: {
            productOfferingVersionId: version.id,
            name: rule.name,
            description: rule.description,
            condition: rule.condition as Prisma.InputJsonValue,
            adjustmentType: rule.adjustmentType,
            adjustmentValue: rule.adjustmentValue,
            priority: rule.priority,
            status: rule.status,
          },
        });
      }

      return offering;
    });

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_CREATED,
      productId: cloned.id,
      actorId,
      metadata: { clonedFrom: id },
    });

    return this.getById(cloned.id);
  }

  async publish(id: string, actorId: string) {
    const product = await prisma.productOffering.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
      },
    });
    if (!product?.versions[0]) throw ApiError.notFound('Product not found');

    const version = product.versions[0];

    await prisma.$transaction([
      prisma.productOfferingVersion.update({
        where: { id: version.id },
        data: {
          status: ProductOfferingVersionStatus.ACTIVE,
          publishedAt: new Date(),
        },
      }),
      prisma.productOffering.update({
        where: { id },
        data: { status: ProductStatus.ACTIVE },
      }),
    ]);

    await catalogAuditService.logProductActivity({
      action: ActivityAction.PRODUCT_STATUS_CHANGED,
      productId: id,
      actorId,
      metadata: { published: true, versionId: version.id },
    });

    return this.getById(id);
  }

  async previewPrice(input: CalculatePriceInput) {
    if (input.versionId) {
      return pricingEngineService.previewWithSnapshot({
        versionId: input.versionId,
        quantity: input.quantity,
        selections: input.selections,
      });
    }
    const result = await pricingEngineService.calculateForProduct(
      input.productId!,
      input.quantity,
      input.selections,
    );
    return {
      ...result,
      formattedTotal: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
        result.grandTotal,
      ),
    };
  }
}

export const adminProductsService = new AdminProductsService();
