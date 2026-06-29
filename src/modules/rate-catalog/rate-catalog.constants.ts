/** ERP pricing strategy display labels — mirrors seed catalogue keys */
export const PRICING_STRATEGY_LABELS: Record<string, string> = {
  per_piece: 'Per Piece',
  per_sheet: 'Per Sheet',
  per_sqft: 'Per Square Foot',
  per_sqm: 'Per Square Meter',
  coverage_based: 'Coverage Based',
  formula_based: 'Formula Based',
  tier_pricing: 'Tier Pricing',
  quantity_pricing: 'Quantity Pricing',
  digital_standard: 'Digital Standard',
  offset_standard: 'Offset Standard',
  flex_area: 'Flex Area',
  vinyl_area: 'Vinyl Area',
  canvas_area: 'Canvas Area',
  board_area: 'Board Area',
  spot_uv_coverage: 'Spot UV Coverage',
  raised_uv_coverage: 'Raised UV Coverage',
  foil_coverage: 'Foil Coverage',
  white_ink: 'White Ink',
  emboss: 'Embossing',
  deboss: 'Debossing',
  binding: 'Binding',
  packaging_unit: 'Packaging Unit',
  screen_standard: 'Screen Print Standard',
  laser_cut: 'Laser Cut',
  die_cut: 'Die Cut',
};

export function pricingStrategyLabel(key: string | null | undefined): string {
  if (!key) return 'Quantity Pricing';
  return PRICING_STRATEGY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
