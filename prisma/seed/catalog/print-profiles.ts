import { ARTWORK_PROFILES } from '../master/artwork-rules.seed.js';
import { VALIDATION_PROFILES } from '../master/validation-rules.seed.js';

export type PrintProfileKey =
  | 'VISITING_CARD'
  | 'VISITING_CARD_UV'
  | 'DIGITAL_SHEET'
  | 'OFFSET_SHEET'
  | 'FLEX'
  | 'VINYL'
  | 'CANVAS'
  | 'BOARD'
  | 'LABEL'
  | 'PACKAGING'
  | 'SPOT_UV'
  | 'FOILING'
  | 'RAISED_UV'
  | 'EMBOSS';

export interface PrintProfile {
  processCode: string;
  sizeTemplateCode: string;
  specCode: string;
  fileUploadCode: string;
  artworkRuleCodes: readonly string[];
  validationRuleCodes: readonly string[];
  coverageRuleCodes?: readonly string[];
  pricingStrategyKey: string;
}

export const PRINT_PROFILES: Record<PrintProfileKey, PrintProfile> = {
  VISITING_CARD: {
    processCode: 'DIGITAL',
    sizeTemplateCode: 'VISITING_CARD_FIXED',
    specCode: 'VISITING_CARD_STD',
    fileUploadCode: 'ARTWORK_MAIN',
    artworkRuleCodes: ARTWORK_PROFILES.CARD,
    validationRuleCodes: VALIDATION_PROFILES.CARD_STD,
    pricingStrategyKey: 'digital_standard',
  },
  VISITING_CARD_UV: {
    processCode: 'SPOT_UV',
    sizeTemplateCode: 'COVERAGE_UV',
    specCode: 'SPOT_UV_CARD',
    fileUploadCode: 'ARTWORK_UV_MASK',
    artworkRuleCodes: ARTWORK_PROFILES.UV,
    validationRuleCodes: VALIDATION_PROFILES.UV_COVERAGE,
    coverageRuleCodes: ['SPOT_UV_STD'],
    pricingStrategyKey: 'spot_uv_coverage',
  },
  DIGITAL_SHEET: {
    processCode: 'DIGITAL',
    sizeTemplateCode: 'DIGITAL_SHEET_SIZES',
    specCode: 'DIGITAL_SHEET_STD',
    fileUploadCode: 'ARTWORK_MAIN',
    artworkRuleCodes: ARTWORK_PROFILES.DIGITAL_SHEET,
    validationRuleCodes: VALIDATION_PROFILES.DIGITAL_SHEET,
    pricingStrategyKey: 'digital_standard',
  },
  OFFSET_SHEET: {
    processCode: 'OFFSET',
    sizeTemplateCode: 'OFFSET_SHEET_SIZES',
    specCode: 'OFFSET_SHEET_STD',
    fileUploadCode: 'ARTWORK_MAIN',
    artworkRuleCodes: ARTWORK_PROFILES.OFFSET,
    validationRuleCodes: VALIDATION_PROFILES.DIGITAL_SHEET,
    pricingStrategyKey: 'offset_standard',
  },
  FLEX: {
    processCode: 'FLEX',
    sizeTemplateCode: 'FLEX_CUSTOM',
    specCode: 'FLEX_LARGE_FORMAT',
    fileUploadCode: 'ARTWORK_LARGE',
    artworkRuleCodes: ARTWORK_PROFILES.FLEX,
    validationRuleCodes: VALIDATION_PROFILES.FLEX,
    pricingStrategyKey: 'flex_area',
  },
  VINYL: {
    processCode: 'VINYL',
    sizeTemplateCode: 'FLEX_CUSTOM',
    specCode: 'VINYL_VEHICLE',
    fileUploadCode: 'ARTWORK_LARGE',
    artworkRuleCodes: ARTWORK_PROFILES.FLEX,
    validationRuleCodes: VALIDATION_PROFILES.FLEX,
    pricingStrategyKey: 'vinyl_area',
  },
  CANVAS: {
    processCode: 'CANVAS',
    sizeTemplateCode: 'CANVAS_CUSTOM',
    specCode: 'CANVAS_GALLERY',
    fileUploadCode: 'ARTWORK_LARGE',
    artworkRuleCodes: ARTWORK_PROFILES.FLEX,
    validationRuleCodes: VALIDATION_PROFILES.FLEX,
    pricingStrategyKey: 'canvas_area',
  },
  BOARD: {
    processCode: 'ACP',
    sizeTemplateCode: 'LARGE_FORMAT_AREA',
    specCode: 'BOARD_ACP_SUNBOARD',
    fileUploadCode: 'ARTWORK_LARGE',
    artworkRuleCodes: ARTWORK_PROFILES.FLEX,
    validationRuleCodes: VALIDATION_PROFILES.FLEX,
    pricingStrategyKey: 'board_area',
  },
  LABEL: {
    processCode: 'DIGITAL',
    sizeTemplateCode: 'LABEL_FIXED',
    specCode: 'LABEL_ROLL',
    fileUploadCode: 'ARTWORK_MAIN',
    artworkRuleCodes: ARTWORK_PROFILES.DIGITAL_SHEET,
    validationRuleCodes: VALIDATION_PROFILES.LABEL,
    pricingStrategyKey: 'per_piece',
  },
  PACKAGING: {
    processCode: 'PACKAGING',
    sizeTemplateCode: 'PACKAGING_CUSTOM',
    specCode: 'PACKAGING_DIELINE',
    fileUploadCode: 'ARTWORK_DIELINE',
    artworkRuleCodes: ARTWORK_PROFILES.PACKAGING,
    validationRuleCodes: VALIDATION_PROFILES.DIGITAL_SHEET,
    pricingStrategyKey: 'packaging_unit',
  },
  SPOT_UV: {
    processCode: 'SPOT_UV',
    sizeTemplateCode: 'COVERAGE_UV',
    specCode: 'SPOT_UV_CARD',
    fileUploadCode: 'ARTWORK_UV_MASK',
    artworkRuleCodes: ARTWORK_PROFILES.UV,
    validationRuleCodes: VALIDATION_PROFILES.UV_COVERAGE,
    coverageRuleCodes: ['SPOT_UV_STD'],
    pricingStrategyKey: 'spot_uv_coverage',
  },
  FOILING: {
    processCode: 'FOILING',
    sizeTemplateCode: 'COVERAGE_UV',
    specCode: 'SPOT_UV_CARD',
    fileUploadCode: 'ARTWORK_UV_MASK',
    artworkRuleCodes: ARTWORK_PROFILES.UV,
    validationRuleCodes: VALIDATION_PROFILES.UV_COVERAGE,
    coverageRuleCodes: ['FOIL_GOLD'],
    pricingStrategyKey: 'foil_coverage',
  },
  RAISED_UV: {
    processCode: 'RAISED_UV',
    sizeTemplateCode: 'COVERAGE_UV',
    specCode: 'SPOT_UV_CARD',
    fileUploadCode: 'ARTWORK_UV_MASK',
    artworkRuleCodes: ARTWORK_PROFILES.UV,
    validationRuleCodes: VALIDATION_PROFILES.UV_COVERAGE,
    coverageRuleCodes: ['RAISED_UV_STD'],
    pricingStrategyKey: 'raised_uv_coverage',
  },
  EMBOSS: {
    processCode: 'EMBOSSING',
    sizeTemplateCode: 'VISITING_CARD_FIXED',
    specCode: 'VISITING_CARD_STD',
    fileUploadCode: 'ARTWORK_MAIN',
    artworkRuleCodes: ARTWORK_PROFILES.CARD,
    validationRuleCodes: VALIDATION_PROFILES.CARD_STD,
    coverageRuleCodes: ['EMBOSS_STD'],
    pricingStrategyKey: 'emboss',
  },
};
