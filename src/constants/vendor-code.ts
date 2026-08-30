/** Public vendor member ID prefix (e.g. GP-1001). */
export const VENDOR_CODE_PREFIX = 'GP';

/**
 * Sequence starts at 1000; first issued code is GP-1001 (1000 + 1).
 * Stored in `vendor_code_sequences.last_value`.
 */
export const VENDOR_CODE_SEQUENCE_START = 1000;

const VENDOR_CODE_PATTERN = /^GP-?\d{4,}$/i;

export function formatVendorCode(sequenceNumber: number): string {
  return `${VENDOR_CODE_PREFIX}-${sequenceNumber}`;
}

export function isValidVendorCode(code: string): boolean {
  return VENDOR_CODE_PATTERN.test(code.trim());
}

export function parseVendorCodeNumber(code: string): number | null {
  if (!isValidVendorCode(code)) return null;
  const digits = code.trim().replace(/^GP-?/i, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Normalize stored codes (GP1002 or GP-1002) to canonical display form GP-1002. */
export function formatVendorCodeDisplay(code: string | null | undefined): string | null {
  if (!code?.trim()) return code ?? null;
  const trimmed = code.trim();
  const upper = trimmed.toUpperCase();
  if (/^GP-\d+$/i.test(trimmed)) return upper;
  const legacy = trimmed.match(/^GP(\d+)$/i);
  if (legacy?.[1]) return formatVendorCode(Number.parseInt(legacy[1], 10));
  return trimmed;
}

/** Search variants so GP1002 and GP-1002 both match legacy and hyphenated rows. */
export function vendorCodeSearchTerms(search: string): string[] {
  const trimmed = search.trim();
  const terms = new Set<string>([trimmed]);
  const match = trimmed.match(/^GP-?(\d+)$/i);
  if (match) {
    terms.add(`GP${match[1]}`);
    terms.add(`GP-${match[1]}`);
  }
  return [...terms];
}
