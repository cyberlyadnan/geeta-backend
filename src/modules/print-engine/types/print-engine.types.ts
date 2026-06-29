import type {
  ArtworkApprovalStatus,
  ArtworkProcessingStatus,
  PrintColorMode,
  PrintLayerRole,
  PrintSizeStrategyType,
  SizeUnit,
  SupportedFileType,
  ValidationLevel,
} from '@prisma/client';

export interface ValidationCheck {
  code: string;
  level: ValidationLevel;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  overallLevel: ValidationLevel;
  canProceed: boolean;
  checks: ValidationCheck[];
}

export interface SizeInput {
  strategyType: PrintSizeStrategyType;
  sizeCode?: string;
  width?: number;
  height?: number;
  unit?: SizeUnit;
}

export interface ResolvedSize {
  code?: string;
  label: string;
  widthMm: number;
  heightMm: number;
  areaCm2: number;
  pricingKey?: string;
  metadata?: Record<string, unknown>;
}

export interface CoverageResult {
  coverageType: string;
  coveragePercent: number;
  coverageMm2: number;
  coverageCm2: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  printablePixels?: number;
  analysisData?: Record<string, unknown>;
}

export interface ArtworkMetadataDto {
  fileFormat: string;
  widthPx?: number;
  heightPx?: number;
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  pageCount?: number;
  colorMode?: PrintColorMode;
  hasTransparency: boolean;
  rotation: number;
  fileSizeBytes: number;
  rawMetadata?: Record<string, unknown>;
}

export interface PrintJobContextDto {
  versionId: string;
  productId: string;
  printProcess?: {
    id: string;
    code: string;
    name: string;
    pricingStrategyKey: string | null;
  } | null;
  printSpecification: Record<string, unknown> | null;
  sizeStrategy: {
    strategyType: PrintSizeStrategyType;
    config: Record<string, unknown>;
    sizes: Array<Record<string, unknown>>;
  } | null;
  fileRequirements: Array<{
    code: string;
    label: string;
    requirementType: string;
    maxFileSizeMb: number | null;
    allowMultiple: boolean;
    allowedFileTypes: SupportedFileType[] | string[];
    printLayer?: {
      code: string;
      label: string;
      role: PrintLayerRole;
      coverageRule?: Record<string, unknown>;
    };
  }>;
  artworkRules: Array<Record<string, unknown>>;
  validationRules?: Array<Record<string, unknown>>;
  coveragePricingRules: Array<Record<string, unknown>>;
  pricingStrategyKey?: string | null;
  product?: {
    name: string;
    displayName: string | null;
  };
  artworkInspectionContext?: import('../artwork-inspection/artwork-inspection.types.js').ArtworkInspectionContextDto;
}

export interface LivePricingInput {
  productId: string;
  versionId: string;
  quantity: number;
  selections: Record<string, string>;
  size?: SizeInput;
  coverageResults?: CoverageResult[];
  orderDeliveryChoice?: boolean | null;
  deliveryAddress?: string | null;
}

export interface ArtworkUploadSlot {
  requirementCode: string;
  artworkFileId: string;
  artworkVersionId: string;
}

export { ArtworkApprovalStatus, ArtworkProcessingStatus, ValidationLevel };
