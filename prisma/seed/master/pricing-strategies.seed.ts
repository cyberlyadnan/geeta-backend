/**
 * Pricing strategy registry — keys referenced by PrintProcess and ProductPrintConfig.
 * Not a database table; ERP-standard strategy catalogue for seed + runtime pricing hooks.
 */
export const PRICING_STRATEGIES = [
  { key: 'per_piece', name: 'Per Piece', description: 'Unit price × quantity (visiting cards, labels)' },
  { key: 'per_sheet', name: 'Per Sheet', description: 'Price per printed sheet (digital / offset)' },
  { key: 'per_sqft', name: 'Per Square Foot', description: 'Area-based large format (flex, vinyl, boards)' },
  { key: 'per_sqm', name: 'Per Square Meter', description: 'Metric area pricing for export / industrial' },
  { key: 'coverage_based', name: 'Coverage Based', description: 'Spot UV, foil, white ink by cm² coverage' },
  { key: 'formula_based', name: 'Formula Based', description: 'Custom formula from configuration fields' },
  { key: 'tier_pricing', name: 'Tier Pricing', description: 'Quantity break tiers on product version' },
  { key: 'quantity_pricing', name: 'Quantity Pricing', description: 'Alias for tier-based quantity breaks' },
  { key: 'digital_standard', name: 'Digital Standard', description: 'Tier + sheet + attribute adjustments' },
  { key: 'offset_standard', name: 'Offset Standard', description: 'Offset run with plate amortization hooks' },
  { key: 'flex_area', name: 'Flex Area', description: 'Custom W×H → sq ft rate' },
  { key: 'vinyl_area', name: 'Vinyl Area', description: 'Vinyl / sticker area pricing' },
  { key: 'canvas_area', name: 'Canvas Area', description: 'Canvas and fabric area pricing' },
  { key: 'board_area', name: 'Board Area', description: 'ACP, sunboard, foam board area pricing' },
  { key: 'spot_uv_coverage', name: 'Spot UV Coverage', description: 'Base tier + UV coverage cm²' },
  { key: 'raised_uv_coverage', name: 'Raised UV Coverage', description: 'Raised UV layer coverage' },
  { key: 'foil_coverage', name: 'Foil Coverage', description: 'Hot foil stamping coverage' },
  { key: 'white_ink', name: 'White Ink', description: 'White ink underprint coverage' },
  { key: 'emboss', name: 'Embossing', description: 'Emboss area / impression pricing' },
  { key: 'deboss', name: 'Debossing', description: 'Deboss area pricing' },
  { key: 'binding', name: 'Binding', description: 'Per-unit binding charge' },
  { key: 'packaging_unit', name: 'Packaging Unit', description: 'Per box / bag unit pricing' },
  { key: 'screen_standard', name: 'Screen Print Standard', description: 'Screen print per colour / piece' },
  { key: 'laser_cut', name: 'Laser Cut', description: 'Cut length / complexity pricing' },
  { key: 'die_cut', name: 'Die Cut', description: 'Die cutting per sheet / impression' },
] as const;

export type PricingStrategyKey = (typeof PRICING_STRATEGIES)[number]['key'];

export function getPricingStrategy(key: string): (typeof PRICING_STRATEGIES)[number] | undefined {
  return PRICING_STRATEGIES.find((s) => s.key === key);
}
