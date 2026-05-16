/**
 * Generates unique order numbers: ORD-YYYYMMDD-XXXXXX
 */
export function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORD-${y}${m}${d}-${random}`;
}
