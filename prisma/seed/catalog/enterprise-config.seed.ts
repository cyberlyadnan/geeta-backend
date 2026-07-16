import {
  ConfigurationFieldType,
  ConfigurationRuleType,
  FileRequirementType,
  OptionPricingStrategy,
  PricingAdjustmentType,
  SupportedFileType,
  type PrismaClient,
} from '@prisma/client';
import { FIRST_CLIENT_PRODUCT_SLUGS } from './first-client-catalog.data.js';
import { syncVersionFileRequirement } from './product-helpers.js';
import {
  ENTERPRISE_BASE_QTY_TIERS,
  ENTERPRISE_CONFIG_FIELDS,
  ENTERPRISE_CONFIG_RULES,
  type SeedOptionDef,
} from './enterprise-config.profile.js';
import type { SeedContext } from '../core/types.js';

export type EnterpriseConfigSeedReport = {
  productsTargeted: string[];
  productsUpdated: string[];
  productsSkipped: string[];
  fieldsUpserted: number;
  optionsUpserted: number;
  rulesSynced: number;
  fileRequirementsSynced: number;
  quantityTiersUpserted: number;
  verification: {
    passed: boolean;
    cases: Array<{ name: string; ok: boolean; detail: string }>;
  };
};

const ARTWORK_TYPES = [
  SupportedFileType.PDF,
  SupportedFileType.AI,
  SupportedFileType.CDR,
  SupportedFileType.PSD,
  SupportedFileType.JPEG,
  SupportedFileType.PNG,
];

async function applyOptionPricing(
  prisma: PrismaClient,
  optionId: string,
  pricing: NonNullable<SeedOptionDef['pricing']>,
): Promise<void> {
  if (pricing.strategy === 'NONE') {
    await prisma.configurationOptionPricing.deleteMany({ where: { optionId } });
    return;
  }

  const base =
    pricing.strategy === 'FIXED'
      ? {
          pricingStrategy: OptionPricingStrategy.FIXED,
          adjustmentType: PricingAdjustmentType.FIXED,
          adjustmentValue: pricing.amount,
        }
      : pricing.strategy === 'PERCENTAGE'
        ? {
            pricingStrategy: OptionPricingStrategy.PERCENTAGE,
            adjustmentType: PricingAdjustmentType.PERCENTAGE,
            adjustmentValue: pricing.percent,
          }
        : {
            pricingStrategy: OptionPricingStrategy.QUANTITY_BASED,
            adjustmentType: PricingAdjustmentType.FIXED,
            adjustmentValue: 0,
          };

  const row = await prisma.configurationOptionPricing.upsert({
    where: { optionId },
    create: {
      optionId,
      ...base,
      strategyConfig: {},
      isActive: true,
    },
    update: {
      ...base,
      strategyConfig: {},
      isActive: true,
    },
  });

  await prisma.configurationOptionQuantityPricing.deleteMany({
    where: { optionPricingId: row.id },
  });

  if (pricing.strategy === 'QUANTITY_BASED' && pricing.tiers.length > 0) {
    await prisma.configurationOptionQuantityPricing.createMany({
      data: pricing.tiers.map((t) => ({
        optionPricingId: row.id,
        quantity: t.quantity,
        price: t.price,
        isActive: true,
      })),
    });
  }
}

async function syncFieldsForVersion(
  prisma: PrismaClient,
  versionId: string,
): Promise<{ fieldIdByCode: Map<string, string>; fields: number; options: number }> {
  const fieldIdByCode = new Map<string, string>();
  let fields = 0;
  let options = 0;

  // Sequential fields (unique constraints), but options priced in parallel batches.
  for (const [fieldIdx, field] of ENTERPRISE_CONFIG_FIELDS.entries()) {
    const isChoiceField = field.options.length > 0;
    const configField = await prisma.configurationField.upsert({
      where: {
        productOfferingVersionId_code: {
          productOfferingVersionId: versionId,
          code: field.code,
        },
      },
      update: {
        label: field.label,
        fieldType: field.fieldType,
        description: field.description ?? null,
        isRequired: field.isRequired ?? isChoiceField,
        isVisible: true,
        sortOrder: fieldIdx + 10,
      },
      create: {
        productOfferingVersionId: versionId,
        code: field.code,
        label: field.label,
        fieldType: field.fieldType,
        description: field.description ?? null,
        isRequired: field.isRequired ?? isChoiceField,
        isVisible: true,
        sortOrder: fieldIdx + 10,
      },
    });
    fieldIdByCode.set(field.code, configField.id);
    fields += 1;

    if (
      field.fieldType === ConfigurationFieldType.TEXTAREA ||
      field.fieldType === ConfigurationFieldType.TEXT ||
      field.options.length === 0
    ) {
      continue;
    }

    // Upsert options then price them in parallel
    const optionIds: Array<{ id: string; pricing: SeedOptionDef['pricing'] }> = [];
    for (const [optIdx, opt] of field.options.entries()) {
      const option = await prisma.configurationOption.upsert({
        where: { fieldId_value: { fieldId: configField.id, value: opt.value } },
        update: {
          label: opt.label,
          sortOrder: optIdx,
          isDefault: opt.isDefault ?? optIdx === 0,
          isActive: true,
        },
        create: {
          fieldId: configField.id,
          label: opt.label,
          value: opt.value,
          sortOrder: optIdx,
          isDefault: opt.isDefault ?? optIdx === 0,
          isActive: true,
        },
      });
      options += 1;
      optionIds.push({ id: option.id, pricing: opt.pricing });
    }

    await Promise.all(
      optionIds.map(async ({ id, pricing }) => {
        if (pricing) await applyOptionPricing(prisma, id, pricing);
        else await prisma.configurationOptionPricing.deleteMany({ where: { optionId: id } });
      }),
    );
  }

  return { fieldIdByCode, fields, options };
}

async function syncRulesForVersion(
  prisma: PrismaClient,
  versionId: string,
  fieldIdByCode: Map<string, string>,
): Promise<number> {
  const targetIds = [...fieldIdByCode.values()];
  await prisma.configurationRule.deleteMany({
    where: {
      productOfferingVersionId: versionId,
      targetFieldId: { in: targetIds },
    },
  });

  if (ENTERPRISE_CONFIG_RULES.length === 0) return 0;

  const data = ENTERPRISE_CONFIG_RULES.flatMap((rule) => {
    const targetFieldId = fieldIdByCode.get(rule.targetFieldCode);
    if (!targetFieldId) return [];
    return [
      {
        productOfferingVersionId: versionId,
        targetFieldId,
        ruleType: rule.ruleType as ConfigurationRuleType,
        condition: rule.condition,
        sortOrder: rule.sortOrder ?? 0,
      },
    ];
  });

  if (data.length === 0) return 0;
  await prisma.configurationRule.createMany({ data });
  return data.length;
}

async function syncFileRequirements(prisma: PrismaClient, versionId: string): Promise<number> {
  await Promise.all([
    syncVersionFileRequirement(prisma, versionId, {
      code: 'ARTWORK_FRONT',
      name: 'Front Artwork',
      requirementType: FileRequirementType.REQUIRED,
      maxFileSizeMb: 100,
      allowMultiple: false,
      allowedFileTypes: ARTWORK_TYPES.map(String),
    }),
    syncVersionFileRequirement(prisma, versionId, {
      code: 'ARTWORK_BACK',
      name: 'Back Artwork',
      requirementType: FileRequirementType.OPTIONAL,
      maxFileSizeMb: 100,
      allowMultiple: false,
      allowedFileTypes: ARTWORK_TYPES.map(String),
    }),
    syncVersionFileRequirement(prisma, versionId, {
      code: 'ARTWORK_MAIN',
      name: 'Main Artwork',
      requirementType: FileRequirementType.REQUIRED,
      maxFileSizeMb: 100,
      allowMultiple: false,
      allowedFileTypes: ARTWORK_TYPES.map(String),
    }),
  ]);
  return 3;
}

async function syncBaseQuantityTiers(
  prisma: PrismaClient,
  versionId: string,
  familySlug: string,
): Promise<number> {
  const key = familySlug.includes('gumming') ? 'gumming-sheet' : 'art-paper';
  const tiers = ENTERPRISE_BASE_QTY_TIERS[key];
  await Promise.all(
    tiers.map((tier) =>
      prisma.quantityPricing.upsert({
        where: {
          productOfferingVersionId_quantity: {
            productOfferingVersionId: versionId,
            quantity: tier.quantity,
          },
        },
        update: { basePrice: tier.basePrice, isActive: true },
        create: {
          productOfferingVersionId: versionId,
          quantity: tier.quantity,
          basePrice: tier.basePrice,
          isActive: true,
        },
      }),
    ),
  );
  return tiers.length;
}

async function verifyPricingEngine(
  prisma: PrismaClient,
  sampleProductId: string,
  versionId: string,
): Promise<EnterpriseConfigSeedReport['verification']> {
  const cases: EnterpriseConfigSeedReport['verification']['cases'] = [];

  try {
    const { productsService } = await import(
      '../../../src/modules/products/products.service.js'
    );

    const matt = await prisma.configurationOption.findFirst({
      where: {
        value: 'matt',
        field: { productOfferingVersionId: versionId, code: 'lamination_type' },
      },
    });

    if (!matt) {
      cases.push({
        name: 'Matt option exists',
        ok: false,
        detail: 'lamination_type/matt option missing',
      });
      return { passed: false, cases };
    }

    const qtyCases = [
      { qty: 100, expectedMatt: 200 },
      { qty: 500, expectedMatt: 700 },
      { qty: 1000, expectedMatt: 1500 },
    ];

    const defaultSelections = {
      printing_side: 'single',
      lamination_type: 'matt',
      corner_type: 'normal',
      packing_type: 'standard',
      delivery_priority: 'normal',
      artwork_check: 'standard',
      hole_punch: 'no',
      folding: 'no',
      numbering: 'no',
      binding: 'none',
      packaging_label: 'no',
    };

    for (const c of qtyCases) {
      const result = await productsService.calculatePrice({
        productId: sampleProductId,
        versionId,
        quantity: c.qty,
        selections: defaultSelections,
      });

      const mattLine = result.lines.find((l) => l.code === 'option:lamination_type');
      const mattAmount = mattLine?.amount ?? -1;
      const ok = Math.abs(mattAmount - c.expectedMatt) < 0.01;

      cases.push({
        name: `Qty ${c.qty} Matt lamination = ₹${c.expectedMatt}`,
        ok,
        detail: ok
          ? `matt=₹${mattAmount}, grandTotal=₹${result.grandTotal}`
          : `expected ₹${c.expectedMatt}, got ₹${mattAmount}; lines=${JSON.stringify(result.lines.map((l) => ({ code: l.code, amount: l.amount })))}`,
      });
    }

    const [low, high, express, normal] = await Promise.all([
      productsService.calculatePrice({
        productId: sampleProductId,
        versionId,
        quantity: 100,
        selections: defaultSelections,
      }),
      productsService.calculatePrice({
        productId: sampleProductId,
        versionId,
        quantity: 1000,
        selections: defaultSelections,
      }),
      productsService.calculatePrice({
        productId: sampleProductId,
        versionId,
        quantity: 100,
        selections: { ...defaultSelections, lamination_type: 'none', delivery_priority: 'express' },
      }),
      productsService.calculatePrice({
        productId: sampleProductId,
        versionId,
        quantity: 100,
        selections: { ...defaultSelections, lamination_type: 'none', delivery_priority: 'normal' },
      }),
    ]);

    cases.push({
      name: 'Grand total increases with quantity',
      ok: high.grandTotal > low.grandTotal,
      detail: `qty100=₹${low.grandTotal}, qty1000=₹${high.grandTotal}`,
    });

    cases.push({
      name: 'Express priority adds percentage surcharge',
      ok: express.grandTotal > normal.grandTotal,
      detail: `normal=₹${normal.grandTotal}, express=₹${express.grandTotal}`,
    });
  } catch (err) {
    cases.push({
      name: 'Pricing engine smoke test',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return { passed: cases.every((c) => c.ok), cases };
}

/**
 * Idempotent enterprise configuration seed for existing Digital Printing products.
 * Targets Art Paper + Gumming families (any slug) — does NOT create catalog masters.
 */
export async function seedEnterpriseProductConfiguration(
  ctx: SeedContext,
): Promise<EnterpriseConfigSeedReport> {
  const { prisma, log } = ctx;
  const report: EnterpriseConfigSeedReport = {
    productsTargeted: [...FIRST_CLIENT_PRODUCT_SLUGS],
    productsUpdated: [],
    productsSkipped: [],
    fieldsUpserted: 0,
    optionsUpserted: 0,
    rulesSynced: 0,
    fileRequirementsSynced: 0,
    quantityTiersUpserted: 0,
    verification: { passed: false, cases: [] },
  };

  const offerings = await prisma.productOffering.findMany({
    where: {
      deletedAt: null,
      OR: [
        { slug: { in: [...FIRST_CLIENT_PRODUCT_SLUGS] } },
        {
          series: {
            family: {
              OR: [
                { slug: { in: ['art-paper', 'gumming-sheet'] } },
                { name: { contains: 'Art Paper', mode: 'insensitive' } },
                { name: { contains: 'Gumming', mode: 'insensitive' } },
              ],
            },
          },
        },
        { name: { contains: 'Art Paper', mode: 'insensitive' } },
        { name: { contains: 'Gumming', mode: 'insensitive' } },
      ],
    },
    include: {
      series: { include: { family: true } },
      versions: {
        where: { isCurrent: true, deletedAt: null },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  });

  const foundSlugs = new Set(offerings.map((o) => o.slug));
  report.productsTargeted = [...foundSlugs];
  for (const slug of FIRST_CLIENT_PRODUCT_SLUGS) {
    if (!foundSlugs.has(slug)) report.productsSkipped.push(`${slug} (canonical slug not in DB)`);
  }

  let sample: { productId: string; versionId: string; name: string } | null = null;

  const limitRaw = process.env.ENTERPRISE_CONFIG_LIMIT;
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const toProcess =
    limit && Number.isFinite(limit) && limit > 0 ? offerings.slice(0, limit) : offerings;

  if (limit) {
    log.info(`ENTERPRISE_CONFIG_LIMIT=${limit} — processing ${toProcess.length} of ${offerings.length}`);
  }

  for (const offering of toProcess) {
    const version = offering.versions[0];
    if (!version) {
      report.productsSkipped.push(`${offering.slug} (no current version)`);
      log.warn(`Skip ${offering.slug}: no current version`);
      continue;
    }

    log.info(`Configuring ${offering.name} (${offering.slug})`);

    const synced = await syncFieldsForVersion(prisma, version.id);
    const rules = await syncRulesForVersion(prisma, version.id, synced.fieldIdByCode);
    const files = await syncFileRequirements(prisma, version.id);
    const tiers = await syncBaseQuantityTiers(
      prisma,
      version.id,
      offering.series.family.slug ?? offering.series.family.name,
    );

    report.productsUpdated.push(offering.slug);
    report.fieldsUpserted += synced.fields;
    report.optionsUpserted += synced.options;
    report.rulesSynced += rules;
    report.fileRequirementsSynced += files;
    report.quantityTiersUpserted += tiers;

    const prefer =
      offering.name.toLowerCase().includes('250') ||
      offering.slug.includes('250');
    if (!sample || prefer) {
      sample = { productId: offering.id, versionId: version.id, name: offering.name };
    }
  }

  if (sample) {
    log.info(`Running pricing verification on ${sample.name}…`);
    report.verification = await verifyPricingEngine(prisma, sample.productId, sample.versionId);
  } else {
    report.verification = {
      passed: false,
      cases: [
        {
          name: 'Products found',
          ok: false,
          detail: 'No Art Paper / Gumming products with current versions found',
        },
      ],
    };
  }

  return report;
}

export function formatEnterpriseConfigReportMarkdown(report: EnterpriseConfigSeedReport): string {
  const lines: string[] = [
    '# Enterprise Product Configuration Seed Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Targeted | ${report.productsTargeted.length} |`,
    `| Updated | ${report.productsUpdated.length} |`,
    `| Skipped | ${report.productsSkipped.length} |`,
    `| Fields upserted | ${report.fieldsUpserted} |`,
    `| Options upserted | ${report.optionsUpserted} |`,
    `| Rules synced | ${report.rulesSynced} |`,
    `| File requirements synced | ${report.fileRequirementsSynced} |`,
    `| Base qty tiers upserted | ${report.quantityTiersUpserted} |`,
    `| Verification | ${report.verification.passed ? 'PASSED' : 'FAILED'} |`,
    '',
    '## Products Updated',
    '',
    ...report.productsUpdated.map((s) => `- \`${s}\``),
    '',
  ];

  if (report.productsSkipped.length) {
    lines.push(
      '## Skipped / Notes',
      '',
      ...report.productsSkipped.map((s) => `- ${s}`),
      '',
    );
  }

  lines.push('## Verification Cases', '');
  for (const c of report.verification.cases) {
    lines.push(`- ${c.ok ? '✓' : '✗'} **${c.name}** — ${c.detail}`);
  }
  lines.push('');

  return lines.join('\n');
}
