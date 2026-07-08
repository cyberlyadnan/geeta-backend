import type { ValidationLevel } from '@prisma/client';
import type { ValidationResult } from '../types/print-engine.types.js';
import type {
  ArtworkAnalysisDto,
  ArtworkInspectionContextDto,
  ArtworkInspectionDto,
  ArtworkWarningDto,
  CoveragePanelDto,
  DimensionCompareDto,
  PageAnalysisDto,
  ProductionNotesDto,
} from './artwork-inspection.types.js';
import { printReadinessEngine } from './print-readiness.engine.js';

interface ArtworkDetailInput {
  previewUrl?: string | null;
  metadata?: {
    fileFormat: string;
    widthPx?: number | null;
    heightPx?: number | null;
    widthMm?: number | null;
    heightMm?: number | null;
    dpi?: number | null;
    pageCount?: number | null;
    colorMode?: string | null;
    hasTransparency?: boolean | null;
    fileSizeBytes?: number | null;
    rawMetadata?: Record<string, unknown> | null;
  } | null;
  validation?: {
    overallLevel: ValidationLevel;
    canProceed: boolean;
    checks: Array<{ code: string; level: ValidationLevel; message: string; details?: Record<string, unknown> }>;
  } | null;
  coverageAnalyses?: Array<{
    coverageType: string;
    coveragePercent: number;
    coverageCm2: number;
    coverageMm2?: number;
    boundingBox?: { x: number; y: number; width: number; height: number } | null;
  }>;
  file: {
    originalName: string;
    extension: string;
    fileSize: number;
    mimeType: string;
  };
  requirementLabel?: string;
  printLayerRole?: string | null;
}

const WARNING_SUGGESTIONS: Record<string, string> = {
  DIMENSIONS: 'Resize artwork to match the design size shown in requirements.',
  DPI: 'Replace low-resolution images or export at 300 DPI minimum.',
  BLEED: 'Extend background artwork to the bleed edge on all sides.',
  SAFE_AREA: 'Move logos and text inside the safe area overlay.',
  PAGE_COUNT: 'Export a PDF with the required number of pages for each print layer.',
  COLOR_MODE: 'Convert artwork to CMYK for accurate print colour.',
  TRANSPARENCY: 'Flatten transparency or verify spot colours with production.',
  ASPECT_RATIO: 'Match the product aspect ratio to avoid unwanted cropping.',
  ORIENTATION: 'Rotate artwork to match the product orientation.',
  FORMAT: 'Upload a supported file format from the requirements list.',
  FILE_SIZE: 'Compress or optimize the file to stay within the upload limit.',
};

function buildDimensionCompare(
  metadata: ArtworkDetailInput['metadata'],
  expected?: { widthMm: number; heightMm: number } | null,
): DimensionCompareDto {
  const detected =
    metadata?.widthMm && metadata?.heightMm
      ? { widthMm: Number(metadata.widthMm), heightMm: Number(metadata.heightMm) }
      : null;

  if (!expected || !detected) {
    return {
      detected,
      expected: expected ?? null,
      status: 'UNKNOWN',
      message: expected
        ? 'Dimensions could not be detected — verify file manually'
        : 'No target dimensions configured for this product',
    };
  }

  const tolerance = 2;
  const delta = {
    widthMm: Math.round((detected.widthMm - expected.widthMm) * 100) / 100,
    heightMm: Math.round((detected.heightMm - expected.heightMm) * 100) / 100,
  };
  const directMatch =
    Math.abs(delta.widthMm) <= tolerance && Math.abs(delta.heightMm) <= tolerance;
  const rotatedMatch =
    Math.abs(detected.widthMm - expected.heightMm) <= tolerance &&
    Math.abs(detected.heightMm - expected.widthMm) <= tolerance;
  const match = directMatch || rotatedMatch;

  return {
    detected,
    expected,
    delta,
    status: match ? 'MATCH' : 'MISMATCH',
    message: match
      ? rotatedMatch
        ? 'Correct size — orientation normalized automatically'
        : 'Correct size'
      : `Wrong artwork size — expected ${expected.widthMm} × ${expected.heightMm} mm`,
    orientationNormalized: rotatedMatch,
    recommendedRotationDeg: rotatedMatch ? 90 : null,
  };
}

function buildAnalysis(metadata: ArtworkDetailInput['metadata'], file: ArtworkDetailInput['file']): ArtworkAnalysisDto {
  const widthPx = metadata?.widthPx ? Number(metadata.widthPx) : undefined;
  const heightPx = metadata?.heightPx ? Number(metadata.heightPx) : undefined;
  const widthMm = metadata?.widthMm ? Number(metadata.widthMm) : undefined;
  const heightMm = metadata?.heightMm ? Number(metadata.heightMm) : undefined;

  let orientation: ArtworkAnalysisDto['orientation'] = null;
  if (widthMm && heightMm) {
    if (Math.abs(widthMm - heightMm) < 0.5) orientation = 'SQUARE';
    else orientation = widthMm > heightMm ? 'LANDSCAPE' : 'PORTRAIT';
  }

  const aspectRatio = widthMm && heightMm ? Math.round((widthMm / heightMm) * 1000) / 1000 : null;

  return {
    resolution: widthPx || heightPx ? { widthPx, heightPx } : null,
    dpi: metadata?.dpi ? Number(metadata.dpi) : null,
    colorMode: metadata?.colorMode ?? null,
    pageCount: metadata?.pageCount ? Number(metadata.pageCount) : null,
    fileSizeBytes: metadata?.fileSizeBytes ?? file.fileSize,
    fileFormat: metadata?.fileFormat ?? file.extension.toUpperCase(),
    hasTransparency: Boolean(metadata?.hasTransparency),
    orientation,
    aspectRatio,
    coveragePercent: null,
    boundingBox: null,
  };
}

function buildWarnings(validation: ValidationResult): ArtworkWarningDto[] {
  return validation.checks
    .filter((c) => c.level !== 'SUCCESS')
    .map((c) => ({
      code: c.code,
      level: c.level,
      title: c.code.replace(/_/g, ' '),
      message: c.message,
      suggestion: WARNING_SUGGESTIONS[c.code] ?? null,
    }));
}

function buildProductionNotes(
  validation: ValidationResult,
  readinessScore: number,
): ProductionNotesDto {
  if (!validation.canProceed) {
    return {
      status: 'NOT_READY',
      headline: 'Not ready for production',
      notes: [
        'Resolve errors before submitting this order.',
        'Use the overlay guide to fix bleed and safe area issues.',
      ],
    };
  }

  if (validation.overallLevel === 'WARNING' || readinessScore < 85) {
    return {
      status: 'REVIEW_REQUIRED',
      headline: 'Manual review recommended',
      notes: [
        'Artwork is acceptable but has warnings.',
        'Production may contact you if issues affect print quality.',
      ],
    };
  }

  if (readinessScore < 95) {
    return {
      status: 'MINOR_WARNING',
      headline: 'Minor warnings',
      notes: ['Artwork acceptable', 'High quality print expected with minor adjustments'],
    };
  }

  return {
    status: 'READY',
    headline: 'Ready for production',
    notes: ['Artwork meets print requirements', 'High quality print expected'],
  };
}

function buildPages(
  context: ArtworkInspectionContextDto,
  detail: ArtworkDetailInput,
): PageAnalysisDto[] {
  const pageNames = context.requirements.pageNames ?? [];
  const required = context.requirements.requiredPages ?? pageNames.length ?? 1;
  const count = Math.max(detail.metadata?.pageCount ?? 1, required, pageNames.length);

  return Array.from({ length: count }, (_, i) => {
    const pageNumber = i + 1;
    const label = pageNames[i] ?? (pageNumber === 1 ? detail.requirementLabel ?? 'Design' : `Page ${pageNumber}`);
    const role = pageNumber === 1 ? detail.printLayerRole ?? 'DESIGN' : pageNames[i] ?? null;

    return {
      pageNumber,
      label,
      role,
      coveragePercent: detail.coverageAnalyses?.[0]?.coveragePercent ?? null,
      previewUrl: pageNumber === 1 ? detail.previewUrl ?? null : null,
    };
  });
}

function buildCoverage(
  detail: ArtworkDetailInput,
  context: ArtworkInspectionContextDto,
): CoveragePanelDto {
  const printableAreaCm2 = context.requirements.designSize
    ? (context.requirements.designSize.widthMm * context.requirements.designSize.heightMm) / 100
    : null;

  const items =
    detail.coverageAnalyses?.map((c) => ({
      coverageType: c.coverageType,
      label: c.coverageType.replace(/_/g, ' '),
      coveragePercent: Number(c.coveragePercent),
      coverageCm2: Number(c.coverageCm2),
      coverageMm2: c.coverageMm2 ? Number(c.coverageMm2) : undefined,
      estimatedInkUsage:
        printableAreaCm2 && c.coveragePercent
          ? `${((c.coveragePercent / 100) * printableAreaCm2).toFixed(2)} cm²`
          : null,
    })) ?? [];

  return { items, printableAreaCm2 };
}

export function buildArtworkInspection(
  context: ArtworkInspectionContextDto,
  detail: ArtworkDetailInput,
): ArtworkInspectionDto {
  const validation: ValidationResult = detail.validation ?? {
    overallLevel: 'WARNING',
    canProceed: true,
    checks: [],
  };

  const analysis = buildAnalysis(detail.metadata, detail.file);
  const coverage = buildCoverage(detail, context);
  if (coverage.items[0]) {
    analysis.coveragePercent = coverage.items[0].coveragePercent;
    analysis.boundingBox = detail.coverageAnalyses?.[0]?.boundingBox ?? null;
  }

  const readiness = printReadinessEngine.calculate(validation.checks);
  const dimensionCompare = buildDimensionCompare(
    detail.metadata,
    context.requirements.designSize,
  );

  return {
    requirements: context.requirements,
    productNotes: context.productNotes,
    printingTips: context.printingTips,
    overlay: context.overlay,
    dimensionCompare,
    analysis,
    validation,
    readiness,
    warnings: buildWarnings(validation),
    productionNotes: buildProductionNotes(validation, readiness.score),
    pages: buildPages(context, detail),
    coverage,
  };
}
