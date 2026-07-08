import type { ValidationLevel } from '@prisma/client';
import type { CoverageResult, ValidationCheck, ValidationResult } from '../types/print-engine.types.js';

export type OverlayKind =
  | 'BLEED'
  | 'TRIM'
  | 'SAFE_AREA'
  | 'PRINTABLE'
  | 'MARGIN'
  | 'CUT_LINE'
  | 'REGISTRATION'
  | 'FOLD'
  | 'CREASE'
  | 'DIE';

export interface OverlayRectMm {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlaySpec {
  kind: OverlayKind;
  label: string;
  color: string;
  strokeWidth: number;
  dash?: number[];
  rect: OverlayRectMm;
  zIndex: number;
}

export interface OverlayCanvasSpec {
  designWidthMm: number;
  designHeightMm: number;
  overlays: OverlaySpec[];
}

export interface ArtworkRequirementsPanelDto {
  productName: string;
  productDisplayName?: string | null;
  trimSize?: { widthMm: number; heightMm: number } | null;
  designSize?: { widthMm: number; heightMm: number } | null;
  safeArea?: { widthMm: number; heightMm: number } | null;
  bleedMm?: number | null;
  minDpi?: number | null;
  colorMode?: string | null;
  requiredPages?: number | null;
  pageNames?: string[];
  allowedFormats: string[];
  maxFileSizeMb?: number | null;
  maxResolutionPx?: number | null;
}

export interface ProductNoteDto {
  id: string;
  label: string;
  icon?: string | null;
}

export interface PrintingTipDto {
  id: string;
  title: string;
  description: string;
  icon?: string | null;
}

export interface DimensionCompareDto {
  detected?: { widthMm: number; heightMm: number } | null;
  expected?: { widthMm: number; heightMm: number } | null;
  delta?: { widthMm: number; heightMm: number } | null;
  status: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  message: string;
  orientationNormalized?: boolean;
  recommendedRotationDeg?: number | null;
}

export interface ArtworkAnalysisDto {
  resolution?: { widthPx?: number; heightPx?: number } | null;
  dpi?: number | null;
  colorMode?: string | null;
  pageCount?: number | null;
  fileSizeBytes: number;
  fileFormat: string;
  hasTransparency: boolean;
  orientation?: 'PORTRAIT' | 'LANDSCAPE' | 'SQUARE' | null;
  aspectRatio?: number | null;
  coveragePercent?: number | null;
  boundingBox?: { x: number; y: number; width: number; height: number } | null;
}

export interface PageAnalysisDto {
  pageNumber: number;
  label: string;
  role?: string | null;
  coveragePercent?: number | null;
  previewUrl?: string | null;
}

export interface CoveragePanelDto {
  items: Array<{
    coverageType: string;
    label: string;
    coveragePercent: number;
    coverageCm2: number;
    coverageMm2?: number;
    estimatedInkUsage?: string | null;
  }>;
  printableAreaCm2?: number | null;
}

export interface PrintReadinessDto {
  score: number;
  grade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';
  stars: number;
  label: string;
  factors: Array<{
    code: string;
    label: string;
    weight: number;
    score: number;
    level: ValidationLevel;
  }>;
}

export interface ProductionNotesDto {
  status: 'READY' | 'MINOR_WARNING' | 'REVIEW_REQUIRED' | 'NOT_READY';
  headline: string;
  notes: string[];
}

export interface ArtworkWarningDto {
  code: string;
  level: ValidationLevel;
  title: string;
  message: string;
  suggestion?: string | null;
}

export interface ArtworkInspectionDto {
  requirements: ArtworkRequirementsPanelDto;
  productNotes: ProductNoteDto[];
  printingTips: PrintingTipDto[];
  overlay: OverlayCanvasSpec | null;
  dimensionCompare: DimensionCompareDto;
  analysis: ArtworkAnalysisDto;
  validation: ValidationResult;
  readiness: PrintReadinessDto;
  warnings: ArtworkWarningDto[];
  productionNotes: ProductionNotesDto;
  pages: PageAnalysisDto[];
  coverage: CoveragePanelDto;
}

export interface ArtworkInspectionContextDto {
  requirements: ArtworkRequirementsPanelDto;
  productNotes: ProductNoteDto[];
  printingTips: PrintingTipDto[];
  overlay: OverlayCanvasSpec | null;
  fileRequirements: Array<{
    code: string;
    label: string;
    requirementType: string;
    printLayer?: { code: string; label: string; role: string } | null;
  }>;
}

export type { CoverageResult, ValidationCheck, ValidationResult };
