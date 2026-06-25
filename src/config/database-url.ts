/**
 * Resolves the database URL used at API runtime.
 *
 * Priority:
 * 1. DATABASE_RUNTIME_URL (explicit)
 * 2. Direct Supabase host (db.*.supabase.co) when DATABASE_USE_DIRECT=true
 * 3. Session pooler upgrade from transaction pooler (6543 → 5432)
 * 4. Original DATABASE_URL
 */
export function resolveRuntimeDatabaseUrl(databaseUrl: string): string {
  const explicitRuntime = process.env['DATABASE_RUNTIME_URL']?.trim();
  if (explicitRuntime) return explicitRuntime;

  if (process.env['DATABASE_USE_DIRECT'] === 'true') {
    const direct = buildSupabaseDirectUrl(databaseUrl) ?? process.env['DIRECT_URL']?.trim();
    if (direct && !direct.includes('pooler.supabase.com')) {
      return appendPoolParams(direct);
    }
  }

  if (process.env['DATABASE_USE_TRANSACTION_POOLER'] === 'true') {
    return appendPoolParams(databaseUrl);
  }

  if (databaseUrl.includes('pooler.supabase.com') && databaseUrl.includes(':6543')) {
    let resolved = databaseUrl.replace(':6543/', ':5432/');
    resolved = resolved.replace(/([?&])pgbouncer=true&?/g, '$1').replace(/[?&]$/, '');
    resolved = resolved.replace(/\?&/, '?').replace(/\?$/, '');
    return appendPoolParams(resolved);
  }

  return appendPoolParams(databaseUrl);
}

/** Direct connection bypasses PgBouncer — best for persistent Node.js API servers */
function buildSupabaseDirectUrl(poolerOrDbUrl: string): string | null {
  const projectRefMatch = poolerOrDbUrl.match(/postgres\.([a-z0-9]+):/i);
  const passwordMatch = poolerOrDbUrl.match(/postgres(?:\.[a-z0-9]+)?:([^@]+)@/i);
  if (!projectRefMatch?.[1] || !passwordMatch?.[1]) return null;

  const projectRef = projectRefMatch[1];
  const password = passwordMatch[1];
  return `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;
}

function appendPoolParams(url: string): string {
  let resolved = url;
  if (!resolved.includes('connect_timeout=')) {
    resolved += resolved.includes('?') ? '&connect_timeout=15' : '?connect_timeout=15';
  }
  if (!resolved.includes('connection_limit=') && resolved.includes('pooler.supabase.com')) {
    resolved += '&connection_limit=10';
  }
  return resolved;
}

export function isTransactionPoolerUrl(url: string): boolean {
  return url.includes(':6543') || (url.includes('pgbouncer=true') && url.includes('6543'));
}

export function isSessionPoolerUrl(url: string): boolean {
  return url.includes('pooler.supabase.com') && url.includes(':5432');
}

export function isDirectSupabaseUrl(url: string): boolean {
  return url.includes('db.') && url.includes('.supabase.co');
}
