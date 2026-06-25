/**
 * Resolves the database URL used at API runtime.
 *
 * Priority:
 * 1. DATABASE_RUNTIME_URL (explicit override)
 * 2. DIRECT_URL (session pooler 5432) when DATABASE_USE_DIRECT=true
 * 3. DATABASE_DIRECT_HOST_URL (db.*.supabase.co) — opt-in only; often unreachable on some networks
 * 4. Session pooler upgrade from transaction pooler (6543 → 5432)
 * 5. Original DATABASE_URL
 */
export function resolveRuntimeDatabaseUrl(databaseUrl: string): string {
  const explicitRuntime = process.env['DATABASE_RUNTIME_URL']?.trim();
  if (explicitRuntime) return appendPoolParams(explicitRuntime);

  if (process.env['DATABASE_USE_DIRECT'] === 'true') {
    const sessionPooler = process.env['DIRECT_URL']?.trim();
    if (sessionPooler) {
      return appendPoolParams(sessionPooler);
    }

    const explicitDbHost = process.env['DATABASE_DIRECT_HOST_URL']?.trim();
    if (explicitDbHost) {
      return appendPoolParams(explicitDbHost);
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
