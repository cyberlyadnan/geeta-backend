import { ApiError } from '../../common/errors/ApiError.js';

/**
 * The scoping rule at the heart of the channel-partner module, with nothing else attached.
 *
 * A partner may read a vendor's orders, invoices and totals only while that vendor is on their
 * active list. This file holds that decision on its own — no database, no request, no session — so
 * the rule can be tested exhaustively and so there is exactly one place in the codebase where it
 * is expressed.
 */

export function isVendorInScope(linkedVendorIds: readonly string[], vendorUserId: string): boolean {
  return linkedVendorIds.includes(vendorUserId);
}

/**
 * Rejects an out-of-scope vendor as "not found" rather than "forbidden", deliberately.
 *
 * A 403 confirms the id exists; a partner could walk ids and learn who else trades on the
 * platform. A 404 tells them nothing they did not already know.
 */
export function assertVendorInScope(
  linkedVendorIds: readonly string[],
  vendorUserId: string,
): void {
  if (!isVendorInScope(linkedVendorIds, vendorUserId)) {
    throw ApiError.notFound('Vendor not found');
  }
}
