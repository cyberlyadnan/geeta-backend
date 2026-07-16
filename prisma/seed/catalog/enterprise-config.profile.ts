import {
  ConfigurationFieldType,
  OptionPricingStrategy,
  PricingAdjustmentType,
} from '@prisma/client';

export type QtyTier = { quantity: number; price: number };

export type SeedOptionDef = {
  value: string;
  label: string;
  isDefault?: boolean;
  /** No pricing row when free */
  pricing?:
    | { strategy: 'NONE' }
    | { strategy: 'FIXED'; amount: number }
    | { strategy: 'PERCENTAGE'; percent: number }
    | { strategy: 'QUANTITY_BASED'; tiers: QtyTier[] };
};

export type SeedFieldDef = {
  code: string;
  label: string;
  fieldType: ConfigurationFieldType;
  isRequired?: boolean;
  description?: string;
  options: SeedOptionDef[];
};

export type SeedRuleDef = {
  targetFieldCode: string;
  ruleType: 'SHOW' | 'HIDE' | 'REQUIRE' | 'DISABLE';
  condition: Record<string, unknown>;
  sortOrder?: number;
};

/** Shared enterprise configuration applied to existing Art Paper + Gumming products. */
export const ENTERPRISE_CONFIG_FIELDS: SeedFieldDef[] = [
  {
    code: 'printing_side',
    label: 'Printing Side',
    fieldType: ConfigurationFieldType.RADIO,
    isRequired: true,
    options: [
      { value: 'single', label: 'Single Side', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'both',
        label: 'Both Side',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 400 },
            { quantity: 500, price: 1500 },
            { quantity: 1000, price: 2800 },
          ],
        },
      },
    ],
  },
  {
    code: 'lamination_type',
    label: 'Lamination Type',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'none', label: 'None', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'matt',
        label: 'Matt',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 200 },
            { quantity: 500, price: 700 },
            { quantity: 1000, price: 1500 },
          ],
        },
      },
      {
        value: 'gloss',
        label: 'Gloss',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 250 },
            { quantity: 500, price: 850 },
            { quantity: 1000, price: 1700 },
          ],
        },
      },
      {
        value: 'velvet',
        label: 'Velvet',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 350 },
            { quantity: 500, price: 1200 },
            { quantity: 1000, price: 2200 },
          ],
        },
      },
      {
        value: 'soft_touch',
        label: 'Soft Touch',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 400 },
            { quantity: 500, price: 1400 },
            { quantity: 1000, price: 2600 },
          ],
        },
      },
    ],
  },
  {
    code: 'lamination_notes',
    label: 'Lamination Notes',
    fieldType: ConfigurationFieldType.TEXTAREA,
    isRequired: false,
    description: 'Optional notes for lamination finishing.',
    options: [],
  },
  {
    code: 'corner_type',
    label: 'Corner Type',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'normal', label: 'Normal', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'round',
        label: 'Round Corner',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 80 },
            { quantity: 500, price: 280 },
            { quantity: 1000, price: 480 },
          ],
        },
      },
    ],
  },
  {
    code: 'packing_type',
    label: 'Packing Type',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'standard', label: 'Standard Packing', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'premium',
        label: 'Premium Packing',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 100 },
            { quantity: 500, price: 350 },
            { quantity: 1000, price: 600 },
          ],
        },
      },
      {
        value: 'bubble',
        label: 'Bubble Packing',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 150 },
            { quantity: 500, price: 500 },
            { quantity: 1000, price: 900 },
          ],
        },
      },
      {
        value: 'wooden',
        label: 'Wooden Packing',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 400 },
            { quantity: 500, price: 1400 },
            { quantity: 1000, price: 2500 },
          ],
        },
      },
    ],
  },
  {
    code: 'delivery_priority',
    label: 'Delivery Priority',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'normal', label: 'Normal', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'urgent',
        label: 'Urgent',
        pricing: { strategy: 'PERCENTAGE', percent: 15 },
      },
      {
        value: 'express',
        label: 'Express',
        pricing: { strategy: 'PERCENTAGE', percent: 25 },
      },
    ],
  },
  {
    code: 'artwork_check',
    label: 'Artwork Check',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      {
        value: 'standard',
        label: 'Standard Verification',
        isDefault: true,
        pricing: { strategy: 'NONE' },
      },
      {
        value: 'premium',
        label: 'Premium Verification',
        pricing: { strategy: 'NONE' },
      },
    ],
  },
  {
    code: 'hole_punch',
    label: 'Hole Punch',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'no', label: 'No', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: '2_holes',
        label: '2 Holes',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 50 },
            { quantity: 500, price: 180 },
            { quantity: 1000, price: 320 },
          ],
        },
      },
      {
        value: '4_holes',
        label: '4 Holes',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 90 },
            { quantity: 500, price: 320 },
            { quantity: 1000, price: 550 },
          ],
        },
      },
    ],
  },
  {
    code: 'folding',
    label: 'Folding',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'no', label: 'No', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'half_fold',
        label: 'Half Fold',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 120 },
            { quantity: 500, price: 400 },
            { quantity: 1000, price: 700 },
          ],
        },
      },
      {
        value: 'tri_fold',
        label: 'Tri Fold',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 180 },
            { quantity: 500, price: 600 },
            { quantity: 1000, price: 1050 },
          ],
        },
      },
      {
        value: 'gate_fold',
        label: 'Gate Fold',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 220 },
            { quantity: 500, price: 750 },
            { quantity: 1000, price: 1300 },
          ],
        },
      },
    ],
  },
  {
    code: 'numbering',
    label: 'Numbering',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'no', label: 'No', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'yes',
        label: 'Yes',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 150 },
            { quantity: 500, price: 500 },
            { quantity: 1000, price: 900 },
          ],
        },
      },
    ],
  },
  {
    code: 'binding',
    label: 'Binding',
    fieldType: ConfigurationFieldType.DROPDOWN,
    isRequired: true,
    options: [
      { value: 'none', label: 'None', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'staple',
        label: 'Staple',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 80 },
            { quantity: 500, price: 250 },
            { quantity: 1000, price: 450 },
          ],
        },
      },
      {
        value: 'spiral',
        label: 'Spiral',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 250 },
            { quantity: 500, price: 900 },
            { quantity: 1000, price: 1600 },
          ],
        },
      },
      {
        value: 'perfect',
        label: 'Perfect Binding',
        pricing: {
          strategy: 'QUANTITY_BASED',
          tiers: [
            { quantity: 100, price: 400 },
            { quantity: 500, price: 1400 },
            { quantity: 1000, price: 2500 },
          ],
        },
      },
    ],
  },
  {
    code: 'packaging_label',
    label: 'Packaging Label',
    fieldType: ConfigurationFieldType.CHECKBOX,
    isRequired: false,
    options: [
      { value: 'no', label: 'No', isDefault: true, pricing: { strategy: 'NONE' } },
      {
        value: 'yes',
        label: 'Yes',
        pricing: { strategy: 'FIXED', amount: 50 },
      },
    ],
  },
  {
    code: 'confirm_back_artwork',
    label: 'Confirm Back Artwork Ready',
    fieldType: ConfigurationFieldType.CHECKBOX,
    isRequired: false,
    description: 'Required when printing both sides — confirm back artwork is uploaded.',
    options: [
      { value: 'no', label: 'No', isDefault: true, pricing: { strategy: 'NONE' } },
      { value: 'yes', label: 'Yes', pricing: { strategy: 'NONE' } },
    ],
  },
];

export const ENTERPRISE_CONFIG_RULES: SeedRuleDef[] = [
  {
    targetFieldCode: 'lamination_notes',
    ruleType: 'HIDE',
    condition: { field: 'lamination_type', equals: 'none' },
    sortOrder: 10,
  },
  {
    targetFieldCode: 'confirm_back_artwork',
    ruleType: 'REQUIRE',
    condition: { field: 'printing_side', equals: 'both' },
    sortOrder: 20,
  },
  {
    targetFieldCode: 'confirm_back_artwork',
    ruleType: 'SHOW',
    condition: { field: 'printing_side', equals: 'both' },
    sortOrder: 21,
  },
  {
    targetFieldCode: 'confirm_back_artwork',
    ruleType: 'HIDE',
    condition: { field: 'printing_side', equals: 'single' },
    sortOrder: 22,
  },
];

/** Expand base quantity pricing for pricing-engine tests. */
export const ENTERPRISE_BASE_QTY_TIERS: Record<
  'art-paper' | 'gumming-sheet',
  Array<{ quantity: number; basePrice: number }>
> = {
  'art-paper': [
    { quantity: 100, basePrice: 1000 },
    { quantity: 500, basePrice: 4200 },
    { quantity: 1000, basePrice: 7800 },
  ],
  'gumming-sheet': [
    { quantity: 100, basePrice: 1500 },
    { quantity: 500, basePrice: 6200 },
    { quantity: 1000, basePrice: 11500 },
  ],
};

export { OptionPricingStrategy, PricingAdjustmentType };
