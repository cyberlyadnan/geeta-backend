import type { CoverageResult } from '../types/print-engine.types.js';

export interface CoveragePricingRuleConfig {
  code: string;
  coverageType: string;
  pricePerCm2: number;
  minCharge?: number | null;
  maxCharge?: number | null;
}

export interface CoveragePriceResult {
  coverageType: string;
  coverageCm2: number;
  unitPrice: number;
  amount: number;
  ruleCode: string;
}

export class CoverageEngine {
  /**
   * Generic coverage analysis from raster alpha/luminance channel.
   * Non-raster formats return estimated coverage from metadata bounds.
   */
  analyzeFromRaster(params: {
    coverageType: string;
    widthPx: number;
    heightPx: number;
    opaquePixelCount: number;
    totalPixels: number;
    widthMm?: number;
    heightMm?: number;
  }): CoverageResult {
    const { coverageType, widthPx, heightPx, opaquePixelCount, totalPixels, widthMm, heightMm } =
      params;

    const coveragePercent = totalPixels > 0 ? (opaquePixelCount / totalPixels) * 100 : 0;
    const pixelAreaMm2 =
      widthMm && heightMm ? (widthMm * heightMm) / totalPixels : 0;
    const coverageMm2 = pixelAreaMm2 * opaquePixelCount;
    const coverageCm2 = coverageMm2 / 100;

    return {
      coverageType,
      coveragePercent: Math.round(coveragePercent * 100) / 100,
      coverageMm2: Math.round(coverageMm2 * 100) / 100,
      coverageCm2: Math.round(coverageCm2 * 100) / 100,
      boundingBox: { x: 0, y: 0, width: widthPx, height: heightPx },
      printablePixels: opaquePixelCount,
      analysisData: { method: 'raster_alpha', totalPixels },
    };
  }

  estimateFromDimensions(params: {
    coverageType: string;
    widthMm: number;
    heightMm: number;
    coveragePercent?: number;
  }): CoverageResult {
    const pct = params.coveragePercent ?? 100;
    const totalMm2 = params.widthMm * params.heightMm;
    const coverageMm2 = (totalMm2 * pct) / 100;

    return {
      coverageType: params.coverageType,
      coveragePercent: pct,
      coverageMm2: Math.round(coverageMm2 * 100) / 100,
      coverageCm2: Math.round((coverageMm2 / 100) * 100) / 100,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      analysisData: { method: 'dimension_estimate' },
    };
  }

  calculatePricing(
    analyses: CoverageResult[],
    rules: CoveragePricingRuleConfig[],
  ): CoveragePriceResult[] {
    const results: CoveragePriceResult[] = [];

    for (const analysis of analyses) {
      const rule = rules.find((r) => r.coverageType === analysis.coverageType);
      if (!rule) continue;

      let amount = analysis.coverageCm2 * rule.pricePerCm2;
      if (rule.minCharge != null) amount = Math.max(amount, rule.minCharge);
      if (rule.maxCharge != null) amount = Math.min(amount, rule.maxCharge);

      results.push({
        coverageType: analysis.coverageType,
        coverageCm2: analysis.coverageCm2,
        unitPrice: rule.pricePerCm2,
        amount: Math.round(amount * 100) / 100,
        ruleCode: rule.code,
      });
    }

    return results;
  }
}

export const coverageEngine = new CoverageEngine();
