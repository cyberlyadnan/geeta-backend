import type { PrintColorMode, ValidationLevel } from '@prisma/client';
import type {
  ArtworkMetadataDto,
  ResolvedSize,
  ValidationCheck,
  ValidationResult,
} from '../types/print-engine.types.js';

export interface PrintSpecRules {
  requiredPages?: number | null;
  minDpi?: number | null;
  maxFileSizeMb?: number | null;
  colorMode?: PrintColorMode;
  artworkWidthMm?: number | null;
  artworkHeightMm?: number | null;
  bleedMm?: number | null;
  safeAreaMm?: number | null;
  allowedFormats?: string[];
  validationRules?: Array<{
    code: string;
    ruleType: string;
    config?: Record<string, unknown>;
    failLevel?: ValidationLevel;
    message?: string;
  }>;
}

export interface ArtworkRuleConfig {
  ruleCode: string;
  ruleType: string;
  config: Record<string, unknown>;
  failLevel: ValidationLevel;
  message?: string | null;
}

function worstLevel(checks: ValidationCheck[]): ValidationLevel {
  if (checks.some((c) => c.level === 'ERROR')) return 'ERROR';
  if (checks.some((c) => c.level === 'WARNING')) return 'WARNING';
  return 'SUCCESS';
}

function resolveTargetDimensions(spec: PrintSpecRules, resolvedSize?: ResolvedSize) {
  if (resolvedSize?.widthMm && resolvedSize?.heightMm) {
    const bleed = Number(spec.bleedMm ?? 0);
    return {
      trimW: resolvedSize.widthMm,
      trimH: resolvedSize.heightMm,
      designW: resolvedSize.widthMm + bleed * 2,
      designH: resolvedSize.heightMm + bleed * 2,
    };
  }

  const designW = spec.artworkWidthMm ? Number(spec.artworkWidthMm) : null;
  const designH = spec.artworkHeightMm ? Number(spec.artworkHeightMm) : null;
  const trimW =
    spec.artworkWidthMm && spec.bleedMm
      ? Number(spec.artworkWidthMm) - Number(spec.bleedMm) * 2
      : spec.artworkWidthMm
        ? Number(spec.artworkWidthMm)
        : null;
  const trimH =
    spec.artworkHeightMm && spec.bleedMm
      ? Number(spec.artworkHeightMm) - Number(spec.bleedMm) * 2
      : spec.artworkHeightMm
        ? Number(spec.artworkHeightMm)
        : null;

  return { trimW, trimH, designW, designH };
}

function dimensionsMatch(
  actualW: number,
  actualH: number,
  expectedW: number,
  expectedH: number,
  tolerance: number,
) {
  const direct =
    Math.abs(actualW - expectedW) <= tolerance &&
    Math.abs(actualH - expectedH) <= tolerance;
  const rotated =
    Math.abs(actualW - expectedH) <= tolerance &&
    Math.abs(actualH - expectedW) <= tolerance;

  return { direct, rotated, any: direct || rotated };
}

export class ValidationEngine {
  validate(
    metadata: ArtworkMetadataDto,
    spec: PrintSpecRules,
    rules: ArtworkRuleConfig[],
    resolvedSize?: ResolvedSize,
  ): ValidationResult {
    const checks: ValidationCheck[] = [];

    this.checkFormat(metadata, spec, checks);
    this.checkFileSize(metadata, spec, checks);
    this.checkPages(metadata, spec, checks);
    this.checkDpi(metadata, spec, checks);
    this.checkDimensions(metadata, spec, resolvedSize, checks);
    this.checkBleed(metadata, spec, resolvedSize, checks);
    this.checkSafeArea(metadata, spec, checks);
    this.checkOrientation(metadata, spec, resolvedSize, checks);
    this.checkColorMode(metadata, spec, checks);
    this.checkTransparency(metadata, checks);

    for (const rule of rules) {
      this.applyRule(rule, metadata, checks);
    }

    const overallLevel = worstLevel(checks);
    return {
      overallLevel,
      canProceed: overallLevel !== 'ERROR',
      checks,
    };
  }

  private checkFormat(metadata: ArtworkMetadataDto, spec: PrintSpecRules, checks: ValidationCheck[]) {
    const allowed = spec.allowedFormats ?? [];
    if (allowed.length === 0) return;

    const fmt = metadata.fileFormat.toUpperCase();
    if (!allowed.map((f) => f.toUpperCase()).includes(fmt)) {
      checks.push({
        code: 'FORMAT',
        level: 'ERROR',
        message: `File format ${fmt} is not allowed. Allowed: ${allowed.join(', ')}`,
      });
    } else {
      checks.push({ code: 'FORMAT', level: 'SUCCESS', message: 'File format is allowed' });
    }
  }

  private checkFileSize(metadata: ArtworkMetadataDto, spec: PrintSpecRules, checks: ValidationCheck[]) {
    const maxMb = spec.maxFileSizeMb;
    if (!maxMb) return;
    const sizeMb = metadata.fileSizeBytes / (1024 * 1024);
    if (sizeMb > maxMb) {
      checks.push({
        code: 'FILE_SIZE',
        level: 'ERROR',
        message: `File size ${sizeMb.toFixed(2)} MB exceeds maximum ${maxMb} MB`,
        details: { sizeMb, maxMb },
      });
    } else {
      checks.push({ code: 'FILE_SIZE', level: 'SUCCESS', message: 'File size within limits' });
    }
  }

  private checkPages(metadata: ArtworkMetadataDto, spec: PrintSpecRules, checks: ValidationCheck[]) {
    const required = spec.requiredPages;
    if (!required || !metadata.pageCount) return;
    if (metadata.pageCount !== required) {
      checks.push({
        code: 'PAGE_COUNT',
        level: 'ERROR',
        message: `Expected ${required} page(s), found ${metadata.pageCount}`,
        details: { required, actual: metadata.pageCount },
      });
    } else {
      checks.push({ code: 'PAGE_COUNT', level: 'SUCCESS', message: 'Page count matches' });
    }
  }

  private checkDpi(metadata: ArtworkMetadataDto, spec: PrintSpecRules, checks: ValidationCheck[]) {
    const minDpi = spec.minDpi;
    if (!minDpi || !metadata.dpi) return;
    if (metadata.dpi < minDpi) {
      checks.push({
        code: 'DPI',
        level: 'WARNING',
        message: `Resolution ${metadata.dpi} DPI is below recommended ${minDpi} DPI`,
        details: { dpi: metadata.dpi, minDpi },
      });
    } else {
      checks.push({ code: 'DPI', level: 'SUCCESS', message: 'Resolution meets minimum DPI' });
    }
  }

  private checkDimensions(
    metadata: ArtworkMetadataDto,
    spec: PrintSpecRules,
    resolvedSize: ResolvedSize | undefined,
    checks: ValidationCheck[],
  ) {
    const { designW: targetW, designH: targetH } = resolveTargetDimensions(spec, resolvedSize);

    if (!targetW || !targetH || !metadata.widthMm || !metadata.heightMm) return;

    const tolerance = Number(spec.bleedMm ?? 2);
    const match = dimensionsMatch(metadata.widthMm, metadata.heightMm, targetW, targetH, tolerance);

    if (!match.any) {
      checks.push({
        code: 'DIMENSIONS',
        level: 'WARNING',
        message: `Artwork dimensions (${metadata.widthMm}×${metadata.heightMm} mm) differ from target (${targetW}×${targetH} mm)`,
        details: { widthMm: metadata.widthMm, heightMm: metadata.heightMm, targetW, targetH },
      });
    } else {
      checks.push({
        code: 'DIMENSIONS',
        level: 'SUCCESS',
        message: match.rotated
          ? 'Dimensions match target size after orientation normalization'
          : 'Dimensions match target size',
      });
    }

    if (metadata.widthMm && metadata.heightMm && targetW && targetH) {
      const artRatio = metadata.widthMm / metadata.heightMm;
      const targetRatio = targetW / targetH;
      if (Math.abs(artRatio - targetRatio) > 0.05) {
        checks.push({
          code: 'ASPECT_RATIO',
          level: 'WARNING',
          message: 'Aspect ratio differs from target — artwork may be cropped or distorted',
        });
      }
    }
  }

  private checkColorMode(metadata: ArtworkMetadataDto, spec: PrintSpecRules, checks: ValidationCheck[]) {
    const required = spec.colorMode;
    if (!required || required === 'ANY' || !metadata.colorMode) return;
    if (metadata.colorMode !== required) {
      checks.push({
        code: 'COLOR_MODE',
        level: 'WARNING',
        message: `Color mode ${metadata.colorMode} may not match required ${required}`,
      });
    } else {
      checks.push({ code: 'COLOR_MODE', level: 'SUCCESS', message: 'Color mode matches' });
    }
  }

  private checkBleed(
    metadata: ArtworkMetadataDto,
    spec: PrintSpecRules,
    resolvedSize: ResolvedSize | undefined,
    checks: ValidationCheck[],
  ) {
    const bleed = spec.bleedMm ? Number(spec.bleedMm) : null;
    const { trimW, trimH, designW: expectedW, designH: expectedH } = resolveTargetDimensions(spec, resolvedSize);

    if (!bleed || !trimW || !trimH || !expectedW || !expectedH || !metadata.widthMm || !metadata.heightMm) return;
    const tolerance = 1.5;

    const matchesDesign = dimensionsMatch(
      metadata.widthMm,
      metadata.heightMm,
      expectedW,
      expectedH,
      tolerance,
    ).any;

    if (matchesDesign) {
      checks.push({
        code: 'BLEED',
        level: 'SUCCESS',
        message: 'Artwork includes bleed margin',
        details: { bleedMm: bleed, trimW, trimH },
      });
      return;
    }

    const matchesTrimOnly = dimensionsMatch(
      metadata.widthMm,
      metadata.heightMm,
      trimW,
      trimH,
      tolerance,
    ).any;

    if (matchesTrimOnly) {
      checks.push({
        code: 'BLEED',
        level: 'ERROR',
        message: `Bleed missing — artwork matches trim size only (${trimW}×${trimH} mm). Add ${bleed} mm bleed on each edge.`,
        details: { bleedMm: bleed, expectedW, expectedH },
      });
      return;
    }

    checks.push({
      code: 'BLEED',
      level: 'WARNING',
      message: `Verify bleed — extend background ${bleed} mm beyond trim on all edges`,
      details: { bleedMm: bleed },
    });
  }

  private checkSafeArea(metadata: ArtworkMetadataDto, spec: PrintSpecRules, checks: ValidationCheck[]) {
    const safeInset = spec.safeAreaMm ? Number(spec.safeAreaMm) : null;
    if (!safeInset || !metadata.widthMm || !metadata.heightMm) return;

    checks.push({
      code: 'SAFE_AREA',
      level: 'WARNING',
      message: `Keep logos and text ${safeInset} mm inside the trim line (safe area shown in overlay)`,
      details: { safeInsetMm: safeInset },
    });
  }

  private checkOrientation(
    metadata: ArtworkMetadataDto,
    spec: PrintSpecRules,
    resolvedSize: ResolvedSize | undefined,
    checks: ValidationCheck[],
  ) {
    const { designW: targetW, designH: targetH } = resolveTargetDimensions(spec, resolvedSize);
    if (!targetW || !targetH || !metadata.widthMm || !metadata.heightMm) return;

    if (dimensionsMatch(metadata.widthMm, metadata.heightMm, targetW, targetH, Number(spec.bleedMm ?? 2)).rotated) {
      checks.push({
        code: 'ORIENTATION',
        level: 'SUCCESS',
        message: 'Orientation normalized automatically for preview and size validation',
      });
      return;
    }

    const artLandscape = metadata.widthMm >= metadata.heightMm;
    const targetLandscape = targetW >= targetH;

    if (artLandscape !== targetLandscape) {
      checks.push({
        code: 'ORIENTATION',
        level: 'WARNING',
        message: 'Artwork orientation may not match product — verify rotation',
      });
    } else {
      checks.push({ code: 'ORIENTATION', level: 'SUCCESS', message: 'Orientation matches product' });
    }
  }

  private checkTransparency(metadata: ArtworkMetadataDto, checks: ValidationCheck[]) {
    if (metadata.hasTransparency) {
      checks.push({
        code: 'TRANSPARENCY',
        level: 'WARNING',
        message: 'File contains transparency — verify print output',
      });
    }
  }

  private applyRule(
    rule: ArtworkRuleConfig,
    metadata: ArtworkMetadataDto,
    checks: ValidationCheck[],
  ) {
    const level = rule.failLevel;
    const message = rule.message ?? `Rule ${rule.ruleCode} failed`;

    switch (rule.ruleType) {
      case 'MIN_DPI': {
        const min = Number(rule.config['minDpi'] ?? 0);
        if (metadata.dpi && metadata.dpi < min) {
          checks.push({ code: rule.ruleCode, level, message, details: { dpi: metadata.dpi, min } });
        }
        break;
      }
      case 'MAX_FILE_MB': {
        const max = Number(rule.config['maxMb'] ?? 0);
        const sizeMb = metadata.fileSizeBytes / (1024 * 1024);
        if (sizeMb > max) {
          checks.push({ code: rule.ruleCode, level, message, details: { sizeMb, max } });
        }
        break;
      }
      case 'REQUIRE_TRANSPARENCY': {
        if (!metadata.hasTransparency) {
          checks.push({ code: rule.ruleCode, level, message });
        }
        break;
      }
      default:
        break;
    }
  }
}

export const validationEngine = new ValidationEngine();
