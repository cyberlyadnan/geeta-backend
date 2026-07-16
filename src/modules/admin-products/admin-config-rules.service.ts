import { ConfigurationRuleType, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import type { CreateConfigRuleInput, UpdateConfigRuleInput } from './admin-products.validation.js';
import { resolveOrderQuestions, type OrderConfigRule } from './order-configuration.evaluator.js';
import { mapOptionPricingDto } from './option-pricing.mapper.js';

function mapRule(row: {
  id: string;
  productOfferingVersionId: string;
  targetFieldId: string;
  ruleType: ConfigurationRuleType;
  condition: unknown;
  sortOrder: number;
  targetField: { code: string; label: string };
}) {
  return {
    id: row.id,
    versionId: row.productOfferingVersionId,
    targetFieldId: row.targetFieldId,
    targetFieldCode: row.targetField.code,
    targetFieldLabel: row.targetField.label,
    ruleType: row.ruleType,
    condition: row.condition as Record<string, unknown>,
    sortOrder: row.sortOrder,
  };
}

export class AdminConfigRulesService {
  async list(versionId: string) {
    const rows = await prisma.configurationRule.findMany({
      where: { productOfferingVersionId: versionId },
      orderBy: { sortOrder: 'asc' },
      include: { targetField: { select: { code: true, label: true } } },
    });
    return rows.map(mapRule);
  }

  async create(input: CreateConfigRuleInput) {
    const version = await prisma.productOfferingVersion.findUnique({
      where: { id: input.versionId },
      select: { id: true },
    });
    if (!version) throw ApiError.notFound('Product version not found');

    const field = await prisma.configurationField.findFirst({
      where: { id: input.targetFieldId, productOfferingVersionId: input.versionId },
    });
    if (!field) throw ApiError.badRequest('Target field must belong to this version');

    const created = await prisma.configurationRule.create({
      data: {
        productOfferingVersionId: input.versionId,
        targetFieldId: input.targetFieldId,
        ruleType: input.ruleType,
        condition: input.condition as Prisma.InputJsonValue,
        sortOrder: input.sortOrder ?? 0,
      },
      include: { targetField: { select: { code: true, label: true } } },
    });
    return mapRule(created);
  }

  async update(id: string, input: UpdateConfigRuleInput) {
    const existing = await prisma.configurationRule.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Configuration rule not found');

    if (input.targetFieldId) {
      const field = await prisma.configurationField.findFirst({
        where: {
          id: input.targetFieldId,
          productOfferingVersionId: existing.productOfferingVersionId,
        },
      });
      if (!field) throw ApiError.badRequest('Target field must belong to this version');
    }

    const data: Prisma.ConfigurationRuleUncheckedUpdateInput = {};
    if (input.targetFieldId != null) data.targetFieldId = input.targetFieldId;
    if (input.ruleType != null) data.ruleType = input.ruleType;
    if (input.condition != null) data.condition = input.condition as Prisma.InputJsonValue;
    if (input.sortOrder != null) data.sortOrder = input.sortOrder;

    const updated = await prisma.configurationRule.update({
      where: { id },
      data,
      include: { targetField: { select: { code: true, label: true } } },
    });
    return mapRule(updated);
  }

  async delete(id: string) {
    const existing = await prisma.configurationRule.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Configuration rule not found');
    await prisma.configurationRule.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Aggregate Order Configuration view for a Product Version.
   * Reuses attributes, rules, file requirements, print config — no new tables.
   */
  async getOrderConfiguration(versionId: string, selections: Record<string, string> = {}) {
    const version = await prisma.productOfferingVersion.findFirst({
      where: { id: versionId, deletedAt: null },
      include: {
        productOffering: { select: { id: true, name: true, displayName: true } },
        configurationFields: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: { pricing: { include: { quantityTiers: { orderBy: { quantity: 'asc' } } } } },
            },
          },
        },
        configurationRules: {
          orderBy: { sortOrder: 'asc' },
          include: { targetField: { select: { id: true, code: true, label: true } } },
        },
        fileRequirementsRel: {
          orderBy: { sortOrder: 'asc' },
          include: { allowedFileTypes: true },
        },
        quantityPricing: { where: { isActive: true }, orderBy: { quantity: 'asc' } },
        productPrintConfig: {
          include: {
            printProcess: { select: { id: true, code: true, name: true, pricingStrategyKey: true } },
            sizeTemplate: { select: { id: true, code: true, name: true, strategyType: true } },
            printSpecificationTemplate: {
              select: {
                id: true,
                code: true,
                name: true,
                bleedMm: true,
                safeAreaMm: true,
                minDpi: true,
                maxFileSizeMb: true,
                colorMode: true,
                allowedFormats: true,
              },
            },
            fileUploadRuleTemplate: {
              select: { id: true, code: true, name: true, maxFileSizeMb: true, allowedFileTypes: true },
            },
          },
        },
        workflow: { include: { workflowTemplate: { select: { id: true, code: true, name: true } } } },
      },
    });

    if (!version) throw ApiError.notFound('Product version not found');

    const rules: OrderConfigRule[] = version.configurationRules.map((r) => ({
      id: r.id,
      targetFieldId: r.targetFieldId,
      targetFieldCode: r.targetField.code,
      ruleType: r.ruleType,
      condition: r.condition as Record<string, unknown>,
      sortOrder: r.sortOrder,
    }));

    const questions = version.configurationFields.map((f) => ({
      id: f.id,
      code: f.code,
      label: f.label,
      description: f.description,
      fieldType: f.fieldType,
      placeholder: f.placeholder,
      isRequired: f.isRequired,
      isVisible: f.isVisible,
      sortOrder: f.sortOrder,
      options: f.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        isDefault: o.isDefault,
        pricing: mapOptionPricingDto(o.pricing),
      })),
    }));

    const resolved = resolveOrderQuestions(questions, rules, selections);
    const printCfg = version.productPrintConfig;
    const spec = printCfg?.printSpecificationTemplate;

    return {
      productId: version.productOffering.id,
      productName: version.productOffering.displayName ?? version.productOffering.name,
      versionId: version.id,
      versionLabel: version.versionLabel,
      hasOrderConfiguration: questions.length > 0 || Boolean(printCfg) || version.fileRequirementsRel.length > 0,
      questions,
      questionState: resolved,
      rules: version.configurationRules.map(mapRule),
      quantityTiers: version.quantityPricing.map((t) => ({
        quantity: t.quantity,
        basePrice: Number(t.basePrice),
      })),
      artwork: {
        fileRequirements: version.fileRequirementsRel.map((r) => ({
          code: r.code,
          label: r.label,
          requirementType: r.requirementType,
          maxFileSizeMb: r.maxFileSizeMb,
          allowMultiple: r.allowMultiple,
          allowedFileTypes: r.allowedFileTypes.map((t) => t.fileType),
        })),
        fileUploadRule: printCfg?.fileUploadRuleTemplate
          ? {
              code: printCfg.fileUploadRuleTemplate.code,
              name: printCfg.fileUploadRuleTemplate.name,
              maxFileSizeMb: printCfg.fileUploadRuleTemplate.maxFileSizeMb,
              allowedFileTypes: printCfg.fileUploadRuleTemplate.allowedFileTypes as string[],
            }
          : null,
        printSpecification: spec
          ? {
              code: spec.code,
              name: spec.name,
              bleedMm: spec.bleedMm != null ? Number(spec.bleedMm) : null,
              safeAreaMm: spec.safeAreaMm != null ? Number(spec.safeAreaMm) : null,
              minDpi: spec.minDpi,
              maxFileSizeMb: spec.maxFileSizeMb,
              colorMode: spec.colorMode,
              allowedFormats: (spec.allowedFormats as string[]) ?? [],
            }
          : null,
        softValidationOnly: true,
      },
      pricing: {
        strategyKey:
          printCfg?.pricingStrategyKey ??
          printCfg?.printProcess?.pricingStrategyKey ??
          version.pricingProfileKey ??
          null,
        process: printCfg?.printProcess
          ? { code: printCfg.printProcess.code, name: printCfg.printProcess.name }
          : null,
      },
      size: printCfg?.sizeTemplate
        ? {
            code: printCfg.sizeTemplate.code,
            name: printCfg.sizeTemplate.name,
            strategyType: printCfg.sizeTemplate.strategyType,
          }
        : null,
      workflow: version.workflow?.workflowTemplate
        ? {
            code: version.workflow.workflowTemplate.code,
            name: version.workflow.workflowTemplate.name,
          }
        : null,
    };
  }
}

export const adminConfigRulesService = new AdminConfigRulesService();
