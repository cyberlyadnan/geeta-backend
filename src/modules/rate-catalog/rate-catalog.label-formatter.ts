type ConfigField = {
  code: string;
  label: string;
  sortOrder: number;
};

const SKIP_VALUE_PATTERNS = [
  'none',
  'no',
  'not_required',
  'not-required',
  'without',
  'sharp',
];

const SKIP_LABEL_PATTERNS = [
  'not required',
  'none',
  'no foiling',
  'no folding',
  'without eyelets',
  'print only',
  'no lamination',
  'sharp corners',
];

export function isSkippableConfigurationValue(value: string, label: string): boolean {
  const v = value.toLowerCase().trim();
  const l = label.toLowerCase().trim();

  if (SKIP_VALUE_PATTERNS.some((p) => v === p || v.startsWith(`${p}_`))) return true;
  if (SKIP_LABEL_PATTERNS.some((p) => l === p || l.includes(p))) return true;
  if (l.startsWith('without ') || l.startsWith('no ')) return true;

  return false;
}

export function formatConfigurationPart(fieldCode: string, label: string, _value: string): string {
  const code = fieldCode.toLowerCase();
  const trimmed = label.trim();

  if (code.includes('foil') && (code.includes('color') || code.includes('colour'))) {
    const color = trimmed.replace(/\s*foil\s*$/i, '');
    if (/^(gold|silver|rose gold|copper)$/i.test(color)) {
      return `${color} foil`;
    }
  }

  if (code.includes('gsm') || code.includes('paper_gsm') || code.includes('board_gsm')) {
    if (/^\d+$/.test(trimmed)) return `${trimmed} GSM`;
    if (!/\bgsm\b/i.test(trimmed)) return `${trimmed} GSM`;
  }

  if (code === 'quantity' || code === 'qty' || code === 'min_qty') {
    if (/^\d+$/.test(trimmed)) return `${trimmed} qty`;
  }

  /** Numeric-only labels on paper/weight fields */
  if (
    (code.includes('paper') || code.includes('weight') || code.includes('gsm')) &&
    /^\d+$/.test(trimmed)
  ) {
    return `${trimmed} GSM`;
  }

  if (code.includes('print') && (code.includes('side') || code.includes('ing'))) {
    if (/both\s*sides?/i.test(trimmed)) return 'Double Side';
    if (/single\s*side/i.test(trimmed)) return 'Single Side';
    if (/double\s*side/i.test(trimmed)) return 'Double Side';
  }

  if (code.includes('lamination') && !code.includes('foil')) {
    if (/matt/i.test(trimmed) && !/lamination/i.test(trimmed)) return `${trimmed} Lamination`;
    if (/gloss/i.test(trimmed) && !/lamination/i.test(trimmed)) return `${trimmed} Lamination`;
  }

  if (code.includes('foiling') || code === 'foil') {
    if (/gold/i.test(trimmed)) return 'Gold foil';
    if (/silver/i.test(trimmed)) return 'Silver foil';
  }

  if (code.includes('uv') && !code.includes('colour') && !code.includes('color')) {
    if (/spot/i.test(trimmed)) return 'Spot UV';
    if (/raised/i.test(trimmed)) return 'Raised UV';
  }

  return trimmed;
}

export function buildConfigurationDisplayLabel(
  fields: ConfigField[],
  selections: Record<string, string>,
  selectionLabels: Record<string, string>,
): string {
  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const parts: string[] = [];

  for (const field of sorted) {
    const value = selections[field.code];
    const label = selectionLabels[field.code];
    if (!value || !label) continue;
    if (isSkippableConfigurationValue(value, label)) continue;

    parts.push(formatConfigurationPart(field.code, label, value));
  }

  return parts.length > 0 ? parts.join(' + ') : 'Standard';
}

export function filterConfigurationSummary<T extends { code: string; defaultValue: string; defaultLabel: string }>(
  items: T[],
): T[] {
  return items.filter(
    (item) => !isSkippableConfigurationValue(item.defaultValue, item.defaultLabel),
  );
}
