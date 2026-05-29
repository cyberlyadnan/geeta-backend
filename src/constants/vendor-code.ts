/** Public vendor member ID prefix (e.g. GP1001). */
export const VENDOR_CODE_PREFIX = 'GP';

/**
 * Sequence starts at 1000; first issued code is GP1001 (1000 + 1).
 * Stored in `vendor_code_sequences.last_value`.
 */
export const VENDOR_CODE_SEQUENCE_START = 1000;

const VENDOR_CODE_PATTERN = /^GP\d{4,}$/;

export function formatVendorCode(sequenceNumber: number): string {
  return `${VENDOR_CODE_PREFIX}${sequenceNumber}`;
}

export function isValidVendorCode(code: string): boolean {
  return VENDOR_CODE_PATTERN.test(code);
}

export function parseVendorCodeNumber(code: string): number | null {
  if (!isValidVendorCode(code)) return null;
  const n = Number.parseInt(code.slice(VENDOR_CODE_PREFIX.length), 10);
  return Number.isFinite(n) ? n : null;
}
