/**
 * The "may this request run as another vendor?" decision, with no database and no Express.
 *
 * Split out so the rule that gates the single most dangerous capability in the system can be
 * tested exhaustively — every method, every path shape — rather than only through an integration
 * test that needs a signed token and a live partner assignment.
 */

/** Methods a partner may use while viewing. Everything else is refused before any route sees it. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths that never accept a view header, whatever the method.
 *
 * Authentication is the obvious one — a partner must not be able to aim token issuing, refreshing
 * or logout at another account. Storage upload authorisation is here because a signed PUT URL is a
 * write dressed up as a GET.
 */
const FORBIDDEN_PREFIXES = ['/api/v1/auth', '/api/v1/storage'];

/**
 * Paths that are always about the signed-in partner themselves, so the header is ignored rather
 * than refused. `/partner/me` is the probe the vendor header uses to decide whether to show the
 * panel switcher at all — answering it as the vendor being viewed would make the way back
 * disappear at exactly the moment it is needed.
 */
const SELF_ONLY_PREFIXES = ['/api/v1/partner'];

export type PartnerViewDecision =
  /** No header, or a path that is always about the partner — run the request unchanged. */
  | { kind: 'ignore' }
  /** Refuse: a write, or a path that never accepts the header. */
  | { kind: 'refuse'; reason: 'method' | 'path' }
  /** Header accepted so far — the vendor link still has to be verified against the database. */
  | { kind: 'verify' };

function startsWithAny(url: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
}

export function decidePartnerView(input: {
  hasHeader: boolean;
  method: string;
  url: string;
}): PartnerViewDecision {
  if (!input.hasHeader) return { kind: 'ignore' };

  // Checked before the method, so a partner's own POST to /partner/... is never mis-refused.
  if (startsWithAny(input.url, SELF_ONLY_PREFIXES)) return { kind: 'ignore' };

  if (!READ_METHODS.has(input.method.toUpperCase())) return { kind: 'refuse', reason: 'method' };
  if (startsWithAny(input.url, FORBIDDEN_PREFIXES)) return { kind: 'refuse', reason: 'path' };

  return { kind: 'verify' };
}
