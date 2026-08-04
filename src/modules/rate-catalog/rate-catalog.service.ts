import { ApiError } from '../../common/errors/ApiError.js';
import { deliverySettingsRepository } from '../../services/delivery/index.js';
import { DEFAULT_GST_RATE } from '../../services/delivery/delivery.types.js';
import { pricingRepository } from '../../repositories/pricing.repository.js';
import { printContextResolver } from '../admin-print-master/print-context.resolver.js';
import { pricingStrategyLabel } from './rate-catalog.constants.js';
import { rateCatalogCacheService, RateCatalogCacheKeys } from './rate-catalog.cache.js';
import { filterConfigurationSummary } from './rate-catalog.label-formatter.js';
import { buildRateMatrix, defaultSelections, selectionLabels } from './rate-catalog.matrix-builder.js';
import { rateCatalogRepository } from './rate-catalog.repository.js';
import { generateRateCatalogPdf } from './rate-catalog.export-pdf.js';
import { generateRateCatalogExcel } from './rate-catalog.export-excel.js';
import type { RateCatalogProductRatesDto } from './rate-catalog.dto.js';
import type {
  RateCatalogCategoriesQuery,
  RateCatalogExportQuery,
  RateCatalogProductRatesQuery,
  RateCatalogProductsQuery,
} from './rate-catalog.validation.js';
import { CacheTtl } from '../../common/cache/cache-keys.js';
import { redisCache } from '../../common/cache/redis-cache.js';

function extractConfigFilters(query: Record<string, unknown>): Record<string, string> {
  const keys = [
    'paper',
    'gsm',
    'lamination',
    'binding',
    'uv',
    'foiling',
    'printSide',
    'color',
    'finish',
    'material',
  ];
  const filters: Record<string, string> = {};
  for (const key of keys) {
    const val = query[key];
    if (typeof val === 'string' && val.trim()) filters[key] = val.trim();
  }
  return filters;
}

function readPlatformGst(futureConfig: unknown): number {
  if (futureConfig && typeof futureConfig === 'object' && 'platform' in futureConfig) {
    const platform = (futureConfig as { platform?: { gstRate?: number } }).platform;
    if (typeof platform?.gstRate === 'number') return platform.gstRate;
  }
  return DEFAULT_GST_RATE;
}

export class RateCatalogService {
  async listCategories(query: RateCatalogCategoriesQuery) {
    return rateCatalogRepository.findCategories(query);
  }

  async listProducts(query: RateCatalogProductsQuery) {
    const result = await rateCatalogRepository.findProducts(query);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        pricingStrategy: item.pricingStrategy
          ? { ...item.pricingStrategy, label: pricingStrategyLabel(item.pricingStrategy.key) }
          : null,
      })),
    };
  }

  async search(query: RateCatalogProductsQuery) {
    return this.listProducts(query);
  }

  async getFilterOptions() {
    return redisCache.getOrLoad(RateCatalogCacheKeys.filters(), CacheTtl.CATEGORY_TREE_SEC, async () => {
      const raw = await rateCatalogRepository.findFilterOptions();
      return {
        categories: raw.categories,
        printProcesses: raw.printProcesses,
        pricingStrategies: raw.pricingStrategies.map((s) => ({
          ...s,
          label: pricingStrategyLabel(s.key),
        })),
        configurationFields: raw.configurationFields,
      };
    });
  }

  async getProductRates(
    productId: string,
    query: RateCatalogProductRatesQuery,
    vendorId: string,
  ): Promise<RateCatalogProductRatesDto> {
    const product = await rateCatalogRepository.findProductForRates(productId);
    if (!product?.versions[0]) throw ApiError.notFound('Product not found');

    const version = product.versions[0];
    const strategyKey =
      version.productPrintConfig?.pricingStrategyKey ??
      version.printProcess?.pricingStrategyKey ??
      version.pricingProfileKey ??
      'quantity_pricing';

    const filters = extractConfigFilters(query);
    const cacheKey = rateCatalogCacheService.buildRatesCacheKey({
      productId,
      versionId: version.id,
      vendorId,
      rowPage: query.rowPage,
      rowLimit: query.rowLimit,
      ...filters,
    });

    const redisKey = RateCatalogCacheKeys.productRates(productId, version.id, cacheKey);

    return rateCatalogCacheService.getProductRates(redisKey, () =>
      this.buildProductRates(product, version, strategyKey, query, filters, vendorId),
    );
  }

  private async buildProductRates(
    product: NonNullable<Awaited<ReturnType<typeof rateCatalogRepository.findProductForRates>>>,
    version: NonNullable<
      NonNullable<Awaited<ReturnType<typeof rateCatalogRepository.findProductForRates>>>['versions'][0]
    >,
    strategyKey: string,
    query: RateCatalogProductRatesQuery,
    filters: Record<string, string>,
    vendorId: string,
  ): Promise<RateCatalogProductRatesDto> {
    const [bundle, settings, printContext] = await Promise.all([
      pricingRepository.loadVersionBundle(version.id),
      deliverySettingsRepository.getOrCreate(),
      printContextResolver.resolveForVersion(version.id),
    ]);

    if (!bundle) throw ApiError.notFound('Pricing configuration not found');

    const gstRate = query.includeGst !== false ? readPlatformGst(settings.futureConfig) : 0;
    const currency = settings.currency ?? 'INR';
    const process =
      version.printProcess ?? version.productPrintConfig?.printProcess ?? null;

    const sizePresets =
      printContext?.sizeStrategy?.presets?.map((p) => ({
        code: p.code,
        label: p.label,
        width: p.width,
        height: p.height,
        unit: p.unit ?? null,
        areaCm2: p.areaCm2 ?? null,
      })) ?? [];

    const firstCoverageRule = printContext?.context.coveragePricingRules?.[0];
    const coverageMinCharge =
      firstCoverageRule && firstCoverageRule['minCharge'] != null
        ? Number(firstCoverageRule['minCharge'])
        : null;

    const matrix = await buildRateMatrix({
      bundle,
      pricingStrategyKey: strategyKey,
      gstRate,
      rowPage: query.rowPage,
      rowLimit: query.rowLimit,
      filters,
      vendorId,
      sizePresets,
      coverageMinCharge,
    });

    const defaults = defaultSelections(bundle);
    const labels = selectionLabels(bundle, defaults);

    const configurationSummary = filterConfigurationSummary(
      bundle.configurationFields
        .filter((f: (typeof bundle.configurationFields)[number]) =>
          f.options.some((o) => o.isActive),
        )
        .map((f: (typeof bundle.configurationFields)[number]) => ({
          code: f.code,
          label: f.label,
          defaultValue: defaults[f.code] ?? '',
          defaultLabel: labels[f.code] ?? '—',
        })),
    );

    return {
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        thumbnailUrl: product.thumbnailUrl ?? product.images[0]?.imageUrl ?? null,
        category: product.series.family.category,
      },
      printProcess: process ? { code: process.code, name: process.name } : null,
      pricingStrategy: { key: strategyKey, label: pricingStrategyLabel(strategyKey) },
      version: {
        id: version.id,
        versionLabel: version.versionLabel,
        versionNumber: version.versionNumber,
        effectiveFrom: version.effectiveFrom.toISOString(),
        publishedAt: version.publishedAt?.toISOString() ?? null,
        updatedAt: version.updatedAt.toISOString(),
      },
      currency,
      gstRate,
      gstLabel: `GST @ ${(gstRate * 100).toFixed(0)}%`,
      configurationSummary,
      matrix,
      generatedAt: new Date().toISOString(),
      filtersApplied: filters,
      rateListType: 'vendor_standard',
    };
  }

  async exportPdf(productId: string, query: RateCatalogExportQuery, vendorId: string) {
    const rates = await this.getProductRates(productId, { ...query, rowPage: 1, rowLimit: 100 }, vendorId);
    const buffer = await generateRateCatalogPdf(rates);
    const filename = `rate-list-${rates.product.slug}-${Date.now()}.pdf`;
    return { buffer, filename, contentType: 'application/pdf' };
  }

  async exportExcel(productId: string, query: RateCatalogExportQuery, vendorId: string) {
    const rates = await this.getProductRates(productId, { ...query, rowPage: 1, rowLimit: 100 }, vendorId);
    const buffer = await generateRateCatalogExcel(rates);
    const filename = `rate-list-${rates.product.slug}-${Date.now()}.xlsx`;
    return {
      buffer,
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}

export const rateCatalogService = new RateCatalogService();
