import { ConfigurationFieldType, PricingAdjustmentType } from '@prisma/client';

export type AttributeOption = {
  value: string;
  label: string;
  adjustment: number;
};

export type AttributeField = {
  code: string;
  label: string;
  fieldType: ConfigurationFieldType;
  options: AttributeOption[];
};

export type AttributeProfileKey =
  | 'VISITING_CARD'
  | 'DIGITAL_SHEET'
  | 'FLEX_BANNER'
  | 'STICKER_LABEL'
  | 'PACKAGING'
  | 'UV_FINISH'
  | 'BOOKLET'
  | 'MINIMAL';

export const ATTRIBUTE_PROFILES: Record<AttributeProfileKey, AttributeField[]> = {
  VISITING_CARD: [
    {
      code: 'paper_gsm',
      label: 'Paper GSM',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: '300', label: '300 GSM', adjustment: 0 },
        { value: '350', label: '350 GSM', adjustment: 150 },
        { value: '400', label: '400 GSM', adjustment: 300 },
        { value: '500', label: '500 GSM', adjustment: 500 },
        { value: '800', label: '800 GSM (Premium)', adjustment: 900 },
      ],
    },
    {
      code: 'finish',
      label: 'Finish',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'matt', label: 'Matt', adjustment: 0 },
        { value: 'gloss', label: 'Gloss', adjustment: 200 },
        { value: 'velvet', label: 'Velvet', adjustment: 350 },
        { value: 'texture', label: 'Texture', adjustment: 400 },
      ],
    },
    {
      code: 'print_side',
      label: 'Print Side',
      fieldType: ConfigurationFieldType.RADIO,
      options: [
        { value: 'single', label: 'Single Side', adjustment: 0 },
        { value: 'both', label: 'Both Sides', adjustment: 300 },
      ],
    },
    {
      code: 'lamination',
      label: 'Lamination',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'none', label: 'None', adjustment: 0 },
        { value: 'matt_lam', label: 'Matt Lamination', adjustment: 250 },
        { value: 'gloss_lam', label: 'Gloss Lamination', adjustment: 250 },
      ],
    },
    {
      code: 'corners',
      label: 'Corners',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'sharp', label: 'Sharp Corners', adjustment: 0 },
        { value: 'round', label: 'Rounded Corners', adjustment: 150 },
      ],
    },
  ],
  DIGITAL_SHEET: [
    {
      code: 'paper_type',
      label: 'Paper Type',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'art_130', label: '130 GSM Art Paper', adjustment: 0 },
        { value: 'art_170', label: '170 GSM Art Paper', adjustment: 200 },
        { value: 'matte_300', label: '300 GSM Matte', adjustment: 450 },
      ],
    },
    {
      code: 'color',
      label: 'Color',
      fieldType: ConfigurationFieldType.RADIO,
      options: [
        { value: 'cmyk', label: 'Full Colour CMYK', adjustment: 0 },
        { value: 'bw', label: 'Black & White', adjustment: -150 },
      ],
    },
    {
      code: 'print_side',
      label: 'Print Side',
      fieldType: ConfigurationFieldType.RADIO,
      options: [
        { value: 'single', label: 'Single Side', adjustment: 0 },
        { value: 'both', label: 'Both Sides', adjustment: 400 },
      ],
    },
    {
      code: 'folding',
      label: 'Folding',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'none', label: 'No Folding', adjustment: 0 },
        { value: 'half', label: 'Half Fold', adjustment: 300 },
        { value: 'tri', label: 'Tri Fold', adjustment: 500 },
        { value: 'z_fold', label: 'Z Fold', adjustment: 550 },
      ],
    },
    {
      code: 'lamination',
      label: 'Lamination',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'none', label: 'None', adjustment: 0 },
        { value: 'matt', label: 'Matt Lamination', adjustment: 350 },
        { value: 'gloss', label: 'Gloss Lamination', adjustment: 350 },
      ],
    },
  ],
  FLEX_BANNER: [
    {
      code: 'material',
      label: 'Material',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'star_flex', label: 'Star Flex', adjustment: 0 },
        { value: 'frontlit', label: 'Frontlit Flex', adjustment: 15 },
        { value: 'backlit', label: 'Backlit Flex', adjustment: 35 },
      ],
    },
    {
      code: 'eyelets',
      label: 'Eyelets',
      fieldType: ConfigurationFieldType.RADIO,
      options: [
        { value: 'no', label: 'Without Eyelets', adjustment: 0 },
        { value: 'yes', label: 'With Eyelets', adjustment: 80 },
      ],
    },
    {
      code: 'mounting',
      label: 'Mounting',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'none', label: 'Print Only', adjustment: 0 },
        { value: 'wooden', label: 'Wooden Frame', adjustment: 450 },
        { value: 'standee', label: 'Standee Mount', adjustment: 650 },
      ],
    },
  ],
  STICKER_LABEL: [
    {
      code: 'material',
      label: 'Material',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'vinyl', label: 'Vinyl', adjustment: 0 },
        { value: 'pp', label: 'PP Synthetic', adjustment: 50 },
        { value: 'clear', label: 'Transparent Vinyl', adjustment: 120 },
      ],
    },
    {
      code: 'lamination',
      label: 'Lamination',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'none', label: 'None', adjustment: 0 },
        { value: 'gloss', label: 'Gloss Lamination', adjustment: 100 },
        { value: 'matt', label: 'Matt Lamination', adjustment: 100 },
      ],
    },
    {
      code: 'cutting',
      label: 'Cutting',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'kiss', label: 'Kiss Cut', adjustment: 0 },
        { value: 'die', label: 'Die Cut', adjustment: 300 },
      ],
    },
  ],
  PACKAGING: [
    {
      code: 'board_gsm',
      label: 'Board GSM',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: '250', label: '250 GSM', adjustment: 0 },
        { value: '300', label: '300 GSM', adjustment: 200 },
        { value: '350', label: '350 GSM', adjustment: 400 },
      ],
    },
    {
      code: 'finish',
      label: 'Finish',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'matt', label: 'Matt', adjustment: 0 },
        { value: 'gloss', label: 'Gloss UV', adjustment: 500 },
      ],
    },
    {
      code: 'foiling',
      label: 'Foiling',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'none', label: 'No Foiling', adjustment: 0 },
        { value: 'gold', label: 'Gold Foil', adjustment: 800 },
        { value: 'silver', label: 'Silver Foil', adjustment: 750 },
      ],
    },
  ],
  UV_FINISH: [
    {
      code: 'uv_type',
      label: 'UV Type',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'spot', label: 'Spot UV', adjustment: 0 },
        { value: 'raised', label: 'Raised UV', adjustment: 500 },
      ],
    },
    {
      code: 'print_side',
      label: 'Print Side',
      fieldType: ConfigurationFieldType.RADIO,
      options: [
        { value: 'single', label: 'Single Side', adjustment: 0 },
        { value: 'both', label: 'Both Sides', adjustment: 400 },
      ],
    },
  ],
  BOOKLET: [
    {
      code: 'binding',
      label: 'Binding',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: 'saddle', label: 'Saddle Stitch', adjustment: 0 },
        { value: 'perfect', label: 'Perfect Bind', adjustment: 600 },
        { value: 'wiro', label: 'Wiro Bind', adjustment: 450 },
      ],
    },
    {
      code: 'pages',
      label: 'Page Count',
      fieldType: ConfigurationFieldType.DROPDOWN,
      options: [
        { value: '8', label: '8 Pages', adjustment: 0 },
        { value: '12', label: '12 Pages', adjustment: 200 },
        { value: '16', label: '16 Pages', adjustment: 400 },
        { value: '24', label: '24 Pages', adjustment: 700 },
      ],
    },
  ],
  MINIMAL: [
    {
      code: 'color',
      label: 'Color',
      fieldType: ConfigurationFieldType.RADIO,
      options: [
        { value: 'cmyk', label: 'Full Colour', adjustment: 0 },
        { value: 'bw', label: 'Black & White', adjustment: -100 },
      ],
    },
  ],
};

export { PricingAdjustmentType };
