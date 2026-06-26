import { ActivityAction, MasterConfigStatus, SheetType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { activityLogService } from '../../services/activity/activity-log.service.js';
import type { ListMasterQuery } from './admin-print-master.validation.js';

type ActorContext = { actorId?: string };

function statusFilter(status: ListMasterQuery['status']): { deletedAt: null; status?: MasterConfigStatus } {
  return {
    deletedAt: null,
    ...(status !== 'ALL' && { status: status as MasterConfigStatus }),
  };
}

function listMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

function logMaster(
  action: ActivityAction,
  entityType: string,
  entityId: string,
  actorId?: string,
  metadata?: Prisma.InputJsonValue,
) {
  activityLogService.logAsync({
    action,
    entityType,
    entityId,
    actorId,
    metadata: metadata ?? {},
  });
}

export class AdminPrintMasterService {
  async getDashboardStats() {
    const [
      sheetSizes,
      templates,
      specifications,
      processes,
      validationRules,
      activeConfigs,
    ] = await Promise.all([
      prisma.sheetSize.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.sizeTemplate.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.printSpecificationTemplate.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.printProcess.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.masterValidationRule.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.productPrintConfig.count(),
    ]);

    return {
      sheetSizes,
      templates,
      specifications,
      processes,
      validationRules,
      activeConfigurations: activeConfigs,
    };
  }

  async listActivity(entityType?: string, limit = 50) {
    return prisma.activityLog.findMany({
      where: {
        ...(entityType && { entityType }),
        action: {
          in: [
            ActivityAction.PRINT_MASTER_CREATED,
            ActivityAction.PRINT_MASTER_UPDATED,
            ActivityAction.PRINT_MASTER_DELETED,
            ActivityAction.PRINT_MASTER_ENABLED,
            ActivityAction.PRINT_MASTER_DISABLED,
            ActivityAction.PRINT_CONFIG_ASSIGNED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  // ── Measurement Units ──────────────────────────────────────────────

  async listUnits(query: ListMasterQuery) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where: Prisma.MeasurementUnitWhereInput = {
      ...statusFilter(status),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.measurementUnit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.measurementUnit.count({ where }),
    ]);
    return { items, meta: listMeta(page, limit, total) };
  }

  async createUnit(data: Prisma.MeasurementUnitCreateInput, ctx: ActorContext) {
    const item = await prisma.measurementUnit.create({ data });
    logMaster(ActivityAction.PRINT_MASTER_CREATED, 'MeasurementUnit', item.id, ctx.actorId, { code: item.code });
    return item;
  }

  async updateUnit(id: string, data: Prisma.MeasurementUnitUpdateInput, ctx: ActorContext) {
    const item = await prisma.measurementUnit.update({ where: { id }, data });
    logMaster(ActivityAction.PRINT_MASTER_UPDATED, 'MeasurementUnit', id, ctx.actorId);
    return item;
  }

  async deleteUnit(id: string, ctx: ActorContext) {
    await prisma.measurementUnit.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    logMaster(ActivityAction.PRINT_MASTER_DELETED, 'MeasurementUnit', id, ctx.actorId);
  }

  // ── Sheet Sizes ────────────────────────────────────────────────────

  async listSheetSizes(query: ListMasterQuery) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where: Prisma.SheetSizeWhereInput = {
      ...statusFilter(status),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.sheetSize.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          measurementUnit: true,
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.sheetSize.count({ where }),
    ]);
    return { items, meta: listMeta(page, limit, total) };
  }

  async getSheetSize(id: string) {
    const item = await prisma.sheetSize.findFirst({
      where: { id, deletedAt: null },
      include: { measurementUnit: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!item) throw ApiError.notFound('Sheet size not found');
    return item;
  }

  async createSheetSize(
    data: {
      code: string;
      name: string;
      width: number;
      height: number;
      measurementUnitId: string;
      aspectRatio?: number;
      sheetType?: SheetType;
      description?: string;
      sortOrder?: number;
      status?: MasterConfigStatus;
    },
    ctx: ActorContext,
  ) {
    const aspectRatio = data.aspectRatio ?? data.width / data.height;
    const item = await prisma.sheetSize.create({
      data: {
        ...data,
        aspectRatio,
        createdById: ctx.actorId,
      },
      include: { measurementUnit: true },
    });
    logMaster(ActivityAction.PRINT_MASTER_CREATED, 'SheetSize', item.id, ctx.actorId, { code: item.code });
    return item;
  }

  async updateSheetSize(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    const item = await prisma.sheetSize.update({
      where: { id },
      data: data as Prisma.SheetSizeUpdateInput,
      include: { measurementUnit: true },
    });
    logMaster(ActivityAction.PRINT_MASTER_UPDATED, 'SheetSize', id, ctx.actorId);
    return item;
  }

  async duplicateSheetSize(id: string, ctx: ActorContext) {
    const source = await this.getSheetSize(id);
    const code = `${source.code}-COPY-${Date.now().toString(36).slice(-4)}`;
    return this.createSheetSize(
      {
        code,
        name: `${source.name} (Copy)`,
        width: Number(source.width),
        height: Number(source.height),
        measurementUnitId: source.measurementUnitId,
        aspectRatio: source.aspectRatio ? Number(source.aspectRatio) : undefined,
        sheetType: source.sheetType,
        description: source.description ?? undefined,
        sortOrder: source.sortOrder + 1,
      },
      ctx,
    );
  }

  async bulkSheetSizeStatus(ids: string[], status: MasterConfigStatus, ctx: ActorContext) {
    await prisma.sheetSize.updateMany({ where: { id: { in: ids } }, data: { status } });
    const action =
      status === 'ACTIVE' ? ActivityAction.PRINT_MASTER_ENABLED : ActivityAction.PRINT_MASTER_DISABLED;
    for (const id of ids) logMaster(action, 'SheetSize', id, ctx.actorId);
    return { updated: ids.length };
  }

  async deleteSheetSize(id: string, ctx: ActorContext) {
    await prisma.sheetSize.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    logMaster(ActivityAction.PRINT_MASTER_DELETED, 'SheetSize', id, ctx.actorId);
  }

  // ── Size Templates ─────────────────────────────────────────────────

  async listSizeTemplates(query: ListMasterQuery) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where: Prisma.SizeTemplateWhereInput = {
      deletedAt: null,
      ...(status !== 'ALL' && { status: status as MasterConfigStatus }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.sizeTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          items: { orderBy: { sortOrder: 'asc' }, include: { sheetSize: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.sizeTemplate.count({ where }),
    ]);
    return { items, meta: listMeta(page, limit, total) };
  }

  async getSizeTemplate(id: string) {
    const item = await prisma.sizeTemplate.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { sheetSize: { include: { measurementUnit: true } } } },
      },
    });
    if (!item) throw ApiError.notFound('Size template not found');
    return item;
  }

  async createSizeTemplate(
    data: {
      code: string;
      name: string;
      strategyType: string;
      config?: Record<string, unknown>;
      description?: string;
      sortOrder?: number;
      status?: MasterConfigStatus;
      items?: Array<{
        sheetSizeId?: string;
        code: string;
        label: string;
        width?: number;
        height?: number;
        unitCode?: string;
        sortOrder?: number;
        isActive?: boolean;
      }>;
    },
    ctx: ActorContext,
  ) {
    const { items, ...rest } = data;
    const template = await prisma.sizeTemplate.create({
      data: {
        ...rest,
        strategyType: rest.strategyType as Prisma.SizeTemplateCreateInput['strategyType'],
        config: (rest.config ?? {}) as Prisma.InputJsonValue,
        createdById: ctx.actorId,
        items: items?.length
          ? {
              create: items.map((item, idx) => ({
                ...item,
                sortOrder: item.sortOrder ?? idx,
              })),
            }
          : undefined,
      },
      include: { items: true },
    });
    logMaster(ActivityAction.PRINT_MASTER_CREATED, 'SizeTemplate', template.id, ctx.actorId, { code: template.code });
    return template;
  }

  async updateSizeTemplate(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    const items = data['items'] as Array<Record<string, unknown>> | undefined;
    delete data['items'];

    const template = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.sizeTemplateItem.deleteMany({ where: { sizeTemplateId: id } });
        await tx.sizeTemplateItem.createMany({
          data: items.map((item, idx) => ({
            sizeTemplateId: id,
            sheetSizeId: item['sheetSizeId'] as string | undefined,
            code: item['code'] as string,
            label: item['label'] as string,
            width: item['width'] as number | undefined,
            height: item['height'] as number | undefined,
            unitCode: item['unitCode'] as string | undefined,
            sortOrder: (item['sortOrder'] as number) ?? idx,
            isActive: (item['isActive'] as boolean) ?? true,
          })),
        });
      }
      return tx.sizeTemplate.update({
        where: { id },
        data: data as Prisma.SizeTemplateUpdateInput,
        include: { items: { include: { sheetSize: true } } },
      });
    });

    logMaster(ActivityAction.PRINT_MASTER_UPDATED, 'SizeTemplate', id, ctx.actorId);
    return template;
  }

  async duplicateSizeTemplate(id: string, ctx: ActorContext) {
    const source = await this.getSizeTemplate(id);
    return this.createSizeTemplate(
      {
        code: `${source.code}-COPY`,
        name: `${source.name} (Copy)`,
        strategyType: source.strategyType,
        config: source.config as Record<string, unknown>,
        description: source.description ?? undefined,
        sortOrder: source.sortOrder + 1,
        items: source.items.map((item) => ({
          sheetSizeId: item.sheetSizeId ?? undefined,
          code: item.code,
          label: item.label,
          width: item.width ? Number(item.width) : undefined,
          height: item.height ? Number(item.height) : undefined,
          unitCode: item.unitCode ?? undefined,
          sortOrder: item.sortOrder,
        })),
      },
      ctx,
    );
  }

  async deleteSizeTemplate(id: string, ctx: ActorContext) {
    await prisma.sizeTemplate.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    logMaster(ActivityAction.PRINT_MASTER_DELETED, 'SizeTemplate', id, ctx.actorId);
  }

  // ── Print Processes ────────────────────────────────────────────────

  async listPrintProcesses(query: ListMasterQuery) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where: Prisma.PrintProcessWhereInput = {
      deletedAt: null,
      ...(status !== 'ALL' && { status: status as MasterConfigStatus }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.printProcess.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: { defaultSizeTemplate: { select: { id: true, code: true, name: true } } },
      }),
      prisma.printProcess.count({ where }),
    ]);
    return { items, meta: listMeta(page, limit, total) };
  }

  async createPrintProcess(data: Record<string, unknown>, ctx: ActorContext) {
    const item = await prisma.printProcess.create({
      data: {
        ...(data as Prisma.PrintProcessUncheckedCreateInput),
        createdById: ctx.actorId ?? null,
      },
    });
    logMaster(ActivityAction.PRINT_MASTER_CREATED, 'PrintProcess', item.id, ctx.actorId, { code: item.code });
    return item;
  }

  async updatePrintProcess(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    const item = await prisma.printProcess.update({ where: { id }, data: data as Prisma.PrintProcessUpdateInput });
    logMaster(ActivityAction.PRINT_MASTER_UPDATED, 'PrintProcess', id, ctx.actorId);
    return item;
  }

  async deletePrintProcess(id: string, ctx: ActorContext) {
    await prisma.printProcess.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    logMaster(ActivityAction.PRINT_MASTER_DELETED, 'PrintProcess', id, ctx.actorId);
  }

  // ── Print Specification Templates ────────────────────────────────────

  async listPrintSpecTemplates(query: ListMasterQuery) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where: Prisma.PrintSpecificationTemplateWhereInput = {
      deletedAt: null,
      ...(status !== 'ALL' && { status: status as MasterConfigStatus }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.printSpecificationTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.printSpecificationTemplate.count({ where }),
    ]);
    return { items, meta: listMeta(page, limit, total) };
  }

  async createPrintSpecTemplate(data: Record<string, unknown>, ctx: ActorContext) {
    const item = await prisma.printSpecificationTemplate.create({
      data: {
        ...(data as Prisma.PrintSpecificationTemplateUncheckedCreateInput),
        createdById: ctx.actorId ?? null,
      },
    });
    logMaster(ActivityAction.PRINT_MASTER_CREATED, 'PrintSpecificationTemplate', item.id, ctx.actorId);
    return item;
  }

  async updatePrintSpecTemplate(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    const item = await prisma.printSpecificationTemplate.update({
      where: { id },
      data: data as Prisma.PrintSpecificationTemplateUpdateInput,
    });
    logMaster(ActivityAction.PRINT_MASTER_UPDATED, 'PrintSpecificationTemplate', id, ctx.actorId);
    return item;
  }

  async deletePrintSpecTemplate(id: string, ctx: ActorContext) {
    await prisma.printSpecificationTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    logMaster(ActivityAction.PRINT_MASTER_DELETED, 'PrintSpecificationTemplate', id, ctx.actorId);
  }

  // ── Artwork / Validation / Coverage / File Upload Rules ────────────

  async listArtworkRules(query: ListMasterQuery) {
    return this.listGenericMaster('masterArtworkRule', query);
  }

  async listValidationRules(query: ListMasterQuery) {
    return this.listGenericMaster('masterValidationRule', query);
  }

  async listCoverageRules(query: ListMasterQuery) {
    return this.listGenericMaster('masterCoverageRule', query);
  }

  async listFileUploadRules(query: ListMasterQuery) {
    return this.listGenericMaster('fileUploadRuleTemplate', query);
  }

  private async listGenericMaster(
    model: 'masterArtworkRule' | 'masterValidationRule' | 'masterCoverageRule' | 'fileUploadRuleTemplate',
    query: ListMasterQuery,
  ) {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const where = {
      deletedAt: null,
      ...(status !== 'ALL' && { status: status as MasterConfigStatus }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const skip = (page - 1) * limit;
    const orderBy = { [sortBy]: sortOrder };

    if (model === 'masterArtworkRule') {
      const [items, total] = await Promise.all([
        prisma.masterArtworkRule.findMany({ where, skip, take: limit, orderBy }),
        prisma.masterArtworkRule.count({ where }),
      ]);
      return { items, meta: listMeta(page, limit, total) };
    }
    if (model === 'masterValidationRule') {
      const [items, total] = await Promise.all([
        prisma.masterValidationRule.findMany({ where, skip, take: limit, orderBy }),
        prisma.masterValidationRule.count({ where }),
      ]);
      return { items, meta: listMeta(page, limit, total) };
    }
    if (model === 'masterCoverageRule') {
      const [items, total] = await Promise.all([
        prisma.masterCoverageRule.findMany({ where, skip, take: limit, orderBy }),
        prisma.masterCoverageRule.count({ where }),
      ]);
      return { items, meta: listMeta(page, limit, total) };
    }
    const [items, total] = await Promise.all([
      prisma.fileUploadRuleTemplate.findMany({ where, skip, take: limit, orderBy }),
      prisma.fileUploadRuleTemplate.count({ where }),
    ]);
    return { items, meta: listMeta(page, limit, total) };
  }

  async createArtworkRule(data: Record<string, unknown>, ctx: ActorContext) {
    return this.createGenericMaster('masterArtworkRule', 'MasterArtworkRule', data, ctx);
  }

  async updateArtworkRule(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    return this.updateGenericMaster('masterArtworkRule', 'MasterArtworkRule', id, data, ctx);
  }

  async deleteArtworkRule(id: string, ctx: ActorContext) {
    return this.deleteGenericMaster('masterArtworkRule', 'MasterArtworkRule', id, ctx);
  }

  async createValidationRule(data: Record<string, unknown>, ctx: ActorContext) {
    return this.createGenericMaster('masterValidationRule', 'MasterValidationRule', data, ctx);
  }

  async updateValidationRule(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    return this.updateGenericMaster('masterValidationRule', 'MasterValidationRule', id, data, ctx);
  }

  async deleteValidationRule(id: string, ctx: ActorContext) {
    return this.deleteGenericMaster('masterValidationRule', 'MasterValidationRule', id, ctx);
  }

  async createCoverageRule(data: Record<string, unknown>, ctx: ActorContext) {
    return this.createGenericMaster('masterCoverageRule', 'MasterCoverageRule', data, ctx);
  }

  async updateCoverageRule(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    return this.updateGenericMaster('masterCoverageRule', 'MasterCoverageRule', id, data, ctx);
  }

  async deleteCoverageRule(id: string, ctx: ActorContext) {
    return this.deleteGenericMaster('masterCoverageRule', 'MasterCoverageRule', id, ctx);
  }

  async createFileUploadRule(data: Record<string, unknown>, ctx: ActorContext) {
    return this.createGenericMaster('fileUploadRuleTemplate', 'FileUploadRuleTemplate', data, ctx);
  }

  async updateFileUploadRule(id: string, data: Record<string, unknown>, ctx: ActorContext) {
    return this.updateGenericMaster('fileUploadRuleTemplate', 'FileUploadRuleTemplate', id, data, ctx);
  }

  async deleteFileUploadRule(id: string, ctx: ActorContext) {
    return this.deleteGenericMaster('fileUploadRuleTemplate', 'FileUploadRuleTemplate', id, ctx);
  }

  private async createGenericMaster(
    model: 'masterArtworkRule' | 'masterValidationRule' | 'masterCoverageRule' | 'fileUploadRuleTemplate',
    entityType: string,
    data: Record<string, unknown>,
    ctx: ActorContext,
  ) {
    const payload = { ...data, createdById: ctx.actorId ?? null };
    const item =
      model === 'masterArtworkRule'
        ? await prisma.masterArtworkRule.create({ data: payload as Prisma.MasterArtworkRuleUncheckedCreateInput })
        : model === 'masterValidationRule'
          ? await prisma.masterValidationRule.create({ data: payload as Prisma.MasterValidationRuleUncheckedCreateInput })
          : model === 'masterCoverageRule'
            ? await prisma.masterCoverageRule.create({ data: payload as Prisma.MasterCoverageRuleUncheckedCreateInput })
            : await prisma.fileUploadRuleTemplate.create({
                data: payload as Prisma.FileUploadRuleTemplateUncheckedCreateInput,
              });
    logMaster(ActivityAction.PRINT_MASTER_CREATED, entityType, item.id, ctx.actorId);
    return item;
  }

  private async updateGenericMaster(
    model: 'masterArtworkRule' | 'masterValidationRule' | 'masterCoverageRule' | 'fileUploadRuleTemplate',
    entityType: string,
    id: string,
    data: Record<string, unknown>,
    ctx: ActorContext,
  ) {
    const item =
      model === 'masterArtworkRule'
        ? await prisma.masterArtworkRule.update({ where: { id }, data: data as Prisma.MasterArtworkRuleUpdateInput })
        : model === 'masterValidationRule'
          ? await prisma.masterValidationRule.update({
              where: { id },
              data: data as Prisma.MasterValidationRuleUpdateInput,
            })
          : model === 'masterCoverageRule'
            ? await prisma.masterCoverageRule.update({
                where: { id },
                data: data as Prisma.MasterCoverageRuleUpdateInput,
              })
            : await prisma.fileUploadRuleTemplate.update({
                where: { id },
                data: data as Prisma.FileUploadRuleTemplateUpdateInput,
              });
    logMaster(ActivityAction.PRINT_MASTER_UPDATED, entityType, id, ctx.actorId);
    return item;
  }

  private async deleteGenericMaster(
    model: 'masterArtworkRule' | 'masterValidationRule' | 'masterCoverageRule' | 'fileUploadRuleTemplate',
    entityType: string,
    id: string,
    ctx: ActorContext,
  ) {
    const patch = { deletedAt: new Date(), status: 'INACTIVE' as const };
    if (model === 'masterArtworkRule') {
      await prisma.masterArtworkRule.update({ where: { id }, data: patch });
    } else if (model === 'masterValidationRule') {
      await prisma.masterValidationRule.update({ where: { id }, data: patch });
    } else if (model === 'masterCoverageRule') {
      await prisma.masterCoverageRule.update({ where: { id }, data: patch });
    } else {
      await prisma.fileUploadRuleTemplate.update({ where: { id }, data: patch });
    }
    logMaster(ActivityAction.PRINT_MASTER_DELETED, entityType, id, ctx.actorId);
  }

  // ── Product Print Config ───────────────────────────────────────────

  async getProductPrintConfig(versionId: string) {
    return prisma.productPrintConfig.findUnique({
      where: { productOfferingVersionId: versionId },
      include: {
        printProcess: true,
        sizeTemplate: { include: { items: { include: { sheetSize: true } } } },
        printSpecificationTemplate: true,
        fileUploadRuleTemplate: true,
      },
    });
  }

  async assignProductPrintConfig(
    versionId: string,
    data: {
      printProcessId?: string | null;
      sizeTemplateId?: string | null;
      printSpecificationTemplateId?: string | null;
      fileUploadRuleTemplateId?: string | null;
      artworkRuleIds?: string[];
      validationRuleIds?: string[];
      coverageRuleIds?: string[];
      pricingStrategyKey?: string | null;
    },
    ctx: ActorContext,
  ) {
    const version = await prisma.productOfferingVersion.findUnique({ where: { id: versionId } });
    if (!version) throw ApiError.notFound('Product version not found');

    const config = await prisma.$transaction(async (tx) => {
      await tx.productOfferingVersion.update({
        where: { id: versionId },
        data: {
          printProcessId: data.printProcessId ?? null,
          sizeTemplateId: data.sizeTemplateId ?? null,
          printSpecificationTemplateId: data.printSpecificationTemplateId ?? null,
        },
      });

      return tx.productPrintConfig.upsert({
        where: { productOfferingVersionId: versionId },
        create: {
          productOfferingVersionId: versionId,
          printProcessId: data.printProcessId ?? null,
          sizeTemplateId: data.sizeTemplateId ?? null,
          printSpecificationTemplateId: data.printSpecificationTemplateId ?? null,
          fileUploadRuleTemplateId: data.fileUploadRuleTemplateId ?? null,
          artworkRuleIds: data.artworkRuleIds ?? [],
          validationRuleIds: data.validationRuleIds ?? [],
          coverageRuleIds: data.coverageRuleIds ?? [],
          pricingStrategyKey: data.pricingStrategyKey ?? null,
        },
        update: {
          printProcessId: data.printProcessId ?? null,
          sizeTemplateId: data.sizeTemplateId ?? null,
          printSpecificationTemplateId: data.printSpecificationTemplateId ?? null,
          fileUploadRuleTemplateId: data.fileUploadRuleTemplateId ?? null,
          artworkRuleIds: data.artworkRuleIds ?? [],
          validationRuleIds: data.validationRuleIds ?? [],
          coverageRuleIds: data.coverageRuleIds ?? [],
          pricingStrategyKey: data.pricingStrategyKey ?? null,
        },
        include: {
          printProcess: true,
          sizeTemplate: true,
          printSpecificationTemplate: true,
          fileUploadRuleTemplate: true,
        },
      });
    });

    logMaster(ActivityAction.PRINT_CONFIG_ASSIGNED, 'ProductPrintConfig', config.id, ctx.actorId, {
      versionId,
    });
    return config;
  }
}

export const adminPrintMasterService = new AdminPrintMasterService();
