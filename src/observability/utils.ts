const UUID_REGEX =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/** Normalize dynamic path segments for per-endpoint metrics */
export function normalizeRoutePath(path: string): string {
  return path
    .split('?')[0]!
    .replace(UUID_REGEX, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

/** Collapse parameterized values in SQL for pattern detection */
export function normalizePrismaQuery(query: string): string {
  return query
    .replace(/\$\d+/g, '?')
    .replace(/'[^']*'/g, '?')
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

export function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
