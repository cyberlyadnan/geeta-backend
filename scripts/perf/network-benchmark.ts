import '../../src/config/load-env.js';
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { resolveRuntimeDatabaseUrl } from '../../src/config/database-url.js';

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

function parseDbHost(url: string): { host: string; port: number } {
  const match = url.match(/@([^:/]+):(\d+)\//);
  if (!match?.[1] || !match[2]) throw new Error(`Cannot parse host from DATABASE_URL`);
  return { host: match[1], port: Number(match[2]) };
}

async function measureDns(host: string): Promise<number> {
  const start = performance.now();
  await dns.lookup(host);
  return roundMs(performance.now() - start);
}

function measureTcp(host: string, port: number): Promise<{ ms: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const socket = net.connect({ host, port }, () => {
      resolve({ ms: roundMs(performance.now() - start), socket });
    });
    socket.on('error', reject);
    socket.setTimeout(15_000, () => {
      socket.destroy();
      reject(new Error('TCP connect timeout'));
    });
  });
}

function measureTls(socket: net.Socket, host: string): Promise<{ ms: number; tlsSocket: tls.TLSSocket }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tlsSocket = tls.connect({ socket, servername: host }, () => {
      resolve({ ms: roundMs(performance.now() - start), tlsSocket });
    });
    tlsSocket.on('error', reject);
  });
}

async function measurePrismaQuery(prisma: PrismaClient, label: string): Promise<number> {
  const start = performance.now();
  await prisma.$queryRaw`SELECT 1 AS ping`;
  const ms = roundMs(performance.now() - start);
  console.log(`  Prisma ${label}: ${ms}ms`);
  return ms;
}

async function main(): Promise<void> {
  const configuredUrl = process.env['DATABASE_URL'] ?? '';
  const runtimeUrl = resolveRuntimeDatabaseUrl(configuredUrl);
  const { host, port } = parseDbHost(runtimeUrl);

  console.log('=== Network & Database Latency Benchmark ===\n');
  console.log(`Configured DATABASE_URL port: ${configuredUrl.includes(':6543') ? 6543 : 5432}`);
  console.log(`Runtime connection host: ${host}:${port}`);
  console.log(`Pooler mode: ${runtimeUrl.includes('pooler.supabase.com') ? (port === 6543 ? 'transaction (6543)' : 'session (5432)') : 'direct/other'}\n`);

  const results: Record<string, number | string> = {};

  try {
    results.dnsMs = await measureDns(host);
    console.log(`DNS lookup (${host}): ${results.dnsMs}ms`);
  } catch (error) {
    results.dnsMs = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
    console.log(`DNS lookup: ${results.dnsMs}`);
  }

  if (typeof results.dnsMs === 'number') {
    try {
      const { ms: tcpMs, socket } = await measureTcp(host, port);
      results.tcpConnectMs = tcpMs;
      console.log(`TCP connect: ${tcpMs}ms`);

      if (port === 5432 || port === 6543) {
        socket.destroy();
        results.tlsMs = 'N/A (PostgreSQL wire protocol, not HTTPS)';
        console.log(`TLS handshake: ${results.tlsMs}`);
      } else {
        const { ms: tlsMs, tlsSocket } = await measureTls(socket, host);
        results.tlsMs = tlsMs;
        console.log(`TLS handshake: ${tlsMs}ms`);
        tlsSocket.destroy();
      }
    } catch (error) {
      results.tcpConnectMs = `FAILED: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`TCP connect: ${results.tcpConnectMs}`);
    }
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: runtimeUrl } },
  });

  try {
    const connectStart = performance.now();
    await prisma.$connect();
    results.prismaConnectMs = roundMs(performance.now() - connectStart);
    console.log(`\nPrisma $connect (first): ${results.prismaConnectMs}ms`);

    const q1 = await measurePrismaQuery(prisma, 'query #1 (cold)');
    const q2 = await measurePrismaQuery(prisma, 'query #2 (warm)');
    const q3 = await measurePrismaQuery(prisma, 'query #3 (warm)');
    results.queryColdMs = q1;
    results.queryWarmAvgMs = roundMs((q2 + q3) / 2);
    results.estimatedRttPerQuery = results.queryWarmAvgMs;

    const txStart = performance.now();
    await prisma.$transaction([
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw`SELECT 2`,
    ]);
    results.transaction2QueriesMs = roundMs(performance.now() - txStart);
    console.log(`  Prisma transaction (2x SELECT): ${results.transaction2QueriesMs}ms`);

    console.log('\n=== Summary ===');
    console.log(JSON.stringify(results, null, 2));
    console.log('\nInterpretation:');
    console.log('- If queryWarmAvgMs >> 50ms from India to ap-southeast-2, network RTT dominates.');
    console.log('- If transaction2QueriesMs ≈ 2× queryWarmAvgMs, queries are sequential (expected).');
    console.log('- Compare configured 6543 vs runtime 5432 — transaction pooler adds BEGIN/COMMIT overhead.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
