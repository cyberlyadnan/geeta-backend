import '../../src/config/load-env.js';
import { performance } from 'node:perf_hooks';

const BASE = process.env['APP_URL'] ?? 'http://localhost:5000';

interface ProbeResult {
  method: string;
  path: string;
  status: number;
  totalMs: number;
  requestId?: string;
}

async function probe(method: string, path: string, body?: unknown, token?: string): Promise<ProbeResult> {
  const url = `${BASE}${path}`;
  const start = performance.now();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const totalMs = Math.round((performance.now() - start) * 100) / 100;
  const requestId = res.headers.get('x-request-id') ?? undefined;
  return { method, path, status: res.status, totalMs, requestId };
}

async function main(): Promise<void> {
  console.log('=== API Latency Probe ===\n');
  console.log(`Base URL: ${BASE}\n`);

  const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/health/database' },
    { method: 'GET', path: '/api/v1/health' },
    { method: 'GET', path: '/api/v1/categories' },
    { method: 'GET', path: '/api/v1/products?page=1&limit=12' },
  ];

  const email = process.env['SEED_SUPER_ADMIN_EMAIL'];
  const password = process.env['SEED_SUPER_ADMIN_PASSWORD'];
  if (email && password) {
    endpoints.push({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email, password },
    });
  }

  const results: ProbeResult[] = [];
  for (const ep of endpoints) {
    const r = await probe(ep.method, ep.path, ep.body);
    results.push(r);
    console.log(
      `${r.method.padEnd(6)} ${r.path.padEnd(40)} ${String(r.status).padStart(3)}  ${r.totalMs}ms  ${r.requestId ?? ''}`,
    );
    await new Promise((res) => setTimeout(res, 200));
  }

  // Warm second pass for cache-sensitive routes
  console.log('\n--- Warm pass (2nd request) ---\n');
  for (const ep of endpoints.slice(0, 4)) {
    const r = await probe(ep.method, ep.path, ep.body);
    console.log(
      `${r.method.padEnd(6)} ${ep.path.padEnd(40)} ${String(r.status).padStart(3)}  ${r.totalMs}ms`,
    );
  }

  console.log('\n=== Summary ===');
  const sorted = [...results].sort((a, b) => b.totalMs - a.totalMs);
  console.log('Slowest (cold):');
  for (const r of sorted.slice(0, 5)) {
    console.log(`  ${r.totalMs}ms  ${r.method} ${r.path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
