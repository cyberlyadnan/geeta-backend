import type { PrintSizeStrategyType, SizeUnit } from '@prisma/client';
import { ApiError } from '../../../common/errors/ApiError.js';
import type { ResolvedSize, SizeInput } from '../types/print-engine.types.js';

const MM_PER_INCH = 25.4;
const MM_PER_FT = 304.8;

export interface SizeStrategyConfig {
  strategyType: PrintSizeStrategyType;
  config: Record<string, unknown>;
  presets: Array<{
    code: string;
    label: string;
    width: number | null;
    height: number | null;
    unit: SizeUnit;
    sheetCode?: string | null;
    areaCm2?: number | null;
    pricingKey?: string | null;
    metadata?: Record<string, unknown>;
  }>;
}

export function toMillimeters(value: number, unit: SizeUnit): number {
  switch (unit) {
    case 'MM':
      return value;
    case 'CM':
      return value * 10;
    case 'INCH':
      return value * MM_PER_INCH;
    case 'FT':
      return value * MM_PER_FT;
    default:
      return value;
  }
}

export function areaCm2FromMm(widthMm: number, heightMm: number): number {
  return (widthMm * heightMm) / 100;
}

export class SizeEngine {
  resolve(strategy: SizeStrategyConfig, input?: SizeInput): ResolvedSize {
    const { strategyType, config, presets } = strategy;

    switch (strategyType) {
      case 'FIXED_SIZE':
        return this.resolveFixed(presets, input);
      case 'SHEET_BASED':
        return this.resolveSheet(presets, input);
      case 'AREA_BASED':
      case 'CUSTOM_SIZE':
        return this.resolveCustom(strategyType, config, presets, input);
      case 'COVERAGE_BASED':
        return this.resolveCoverageBased(config, presets);
      case 'ROLL_BASED':
        return this.resolveRoll(config, input);
      default:
        throw ApiError.badRequest(`Unsupported size strategy: ${strategyType}`);
    }
  }

  private resolveFixed(
    presets: SizeStrategyConfig['presets'],
    input?: SizeInput,
  ): ResolvedSize {
    const preset = input?.sizeCode
      ? presets.find((p) => p.code === input.sizeCode)
      : presets[0];

    if (!preset?.width || !preset.height) {
      throw ApiError.badRequest('Fixed size preset not configured');
    }

    const widthMm = toMillimeters(Number(preset.width), preset.unit);
    const heightMm = toMillimeters(Number(preset.height), preset.unit);

    return {
      code: preset.code,
      label: preset.label,
      widthMm,
      heightMm,
      areaCm2: preset.areaCm2 ? Number(preset.areaCm2) : areaCm2FromMm(widthMm, heightMm),
      pricingKey: preset.pricingKey ?? undefined,
      metadata: preset.metadata,
    };
  }

  private resolveSheet(
    presets: SizeStrategyConfig['presets'],
    input?: SizeInput,
  ): ResolvedSize {
    if (!input?.sizeCode) {
      throw ApiError.badRequest('Sheet size selection is required');
    }
    return this.resolveFixed(presets, input);
  }

  private resolveCustom(
    strategyType: PrintSizeStrategyType,
    config: Record<string, unknown>,
    presets: SizeStrategyConfig['presets'],
    input?: SizeInput,
  ): ResolvedSize {
    if (input?.sizeCode) {
      return this.resolveFixed(presets, input);
    }

    const width = input?.width;
    const height = input?.height;
    const unit = input?.unit ?? (config['defaultUnit'] as SizeUnit) ?? 'MM';

    if (width == null || height == null) {
      throw ApiError.badRequest('Width and height are required for custom sizing');
    }

    const widthMm = toMillimeters(width, unit);
    const heightMm = toMillimeters(height, unit);
    const minW = Number(config['minWidthMm'] ?? 0);
    const minH = Number(config['minHeightMm'] ?? 0);
    const maxW = Number(config['maxWidthMm'] ?? 10_000);
    const maxH = Number(config['maxHeightMm'] ?? 10_000);

    if (widthMm < minW || heightMm < minH) {
      throw ApiError.badRequest(`Size below minimum (${minW}×${minH} mm)`);
    }
    if (widthMm > maxW || heightMm > maxH) {
      throw ApiError.badRequest(`Size exceeds maximum (${maxW}×${maxH} mm)`);
    }

    return {
      label: strategyType === 'AREA_BASED' ? 'Custom area' : 'Custom size',
      widthMm,
      heightMm,
      areaCm2: areaCm2FromMm(widthMm, heightMm),
      metadata: { unit, strategyType },
    };
  }

  private resolveCoverageBased(
    config: Record<string, unknown>,
    presets: SizeStrategyConfig['presets'],
  ): ResolvedSize {
    if (presets[0]) {
      return this.resolveFixed(presets);
    }
    const refW = Number(config['referenceWidthMm'] ?? 0);
    const refH = Number(config['referenceHeightMm'] ?? 0);
    return {
      label: 'Coverage-based',
      widthMm: refW,
      heightMm: refH,
      areaCm2: refW && refH ? areaCm2FromMm(refW, refH) : 0,
      metadata: { coverageBased: true },
    };
  }

  private resolveRoll(config: Record<string, unknown>, input?: SizeInput): ResolvedSize {
    const widthMm = input?.width
      ? toMillimeters(input.width, input.unit ?? 'MM')
      : Number(config['rollWidthMm'] ?? 0);
    const lengthMm = input?.height
      ? toMillimeters(input.height, input.unit ?? 'MM')
      : Number(config['defaultLengthMm'] ?? 0);

    if (!widthMm || !lengthMm) {
      throw ApiError.badRequest('Roll width and length are required');
    }

    return {
      label: 'Roll',
      widthMm,
      heightMm: lengthMm,
      areaCm2: areaCm2FromMm(widthMm, lengthMm),
      metadata: { rollBased: true },
    };
  }
}

export const sizeEngine = new SizeEngine();
