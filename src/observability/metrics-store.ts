import { randomUUID } from 'node:crypto';
import type {
  ApiEndpointMetrics,
  DatabaseMetrics,
  ErrorEntry,
  MetricsExporter,
  NPlusOneWarning,
  PerformanceMetrics,
  PrismaQueryEntry,
  QueryPatternStats,
  RequestLogEntry,
  RequestTimeline,
  SlowRequestEntry,
  SystemHealthStatus,
} from './types.js';
import { normalizeRoutePath, roundMs } from './utils.js';

const MAX_REQUEST_LOGS = 2_000;
const MAX_SLOW_LOGS = 500;
const MAX_QUERY_LOGS = 1_000;
const MAX_ERRORS = 500;
const MAX_N_PLUS_ONE = 200;
const SLOW_API_THRESHOLD_MS = Number(process.env['OBSERVABILITY_SLOW_API_THRESHOLD_MS'] ?? 1_000);
const SLOW_QUERY_THRESHOLD_MS = Number(process.env['OBSERVABILITY_SLOW_QUERY_MS'] ?? 100);
const N_PLUS_ONE_THRESHOLD = Number(process.env['OBSERVABILITY_N_PLUS_ONE_COUNT'] ?? 5);

const startedAt = Date.now();

class MetricsStore {
  private requestLogs: RequestLogEntry[] = [];
  private slowRequests: SlowRequestEntry[] = [];
  private queryLogs: PrismaQueryEntry[] = [];
  private errors: ErrorEntry[] = [];
  private endpointMetrics = new Map<string, ApiEndpointMetrics>();
  private queryPatterns = new Map<string, QueryPatternStats>();
  private nPlusOneWarnings: NPlusOneWarning[] = [];
  private exporters: MetricsExporter[] = [];
  private totalDatabaseTimeMs = 0;
  private queryCount = 0;
  private slowQueryCount = 0;
  private failedRequestCount = 0;

  registerExporter(exporter: MetricsExporter): void {
    this.exporters.push(exporter);
  }

  recordRequest(entry: RequestLogEntry): void {
    this.requestLogs.push(entry);
    if (this.requestLogs.length > MAX_REQUEST_LOGS) {
      this.requestLogs.shift();
    }

    if (entry.statusCode >= 400) {
      this.failedRequestCount += 1;
    }

    const key = `${entry.method} ${entry.route}`;
    const existing = this.endpointMetrics.get(key);
    const isError = entry.statusCode >= 400;

    if (!existing) {
      this.endpointMetrics.set(key, {
        method: entry.method,
        route: entry.route,
        requestCount: 1,
        errorCount: isError ? 1 : 0,
        successCount: isError ? 0 : 1,
        totalDurationMs: entry.durationMs,
        minDurationMs: entry.durationMs,
        maxDurationMs: entry.durationMs,
        avgDurationMs: entry.durationMs,
        successRate: isError ? 0 : 100,
      });
    } else {
      existing.requestCount += 1;
      if (isError) existing.errorCount += 1;
      else existing.successCount += 1;
      existing.totalDurationMs += entry.durationMs;
      existing.minDurationMs = Math.min(existing.minDurationMs, entry.durationMs);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, entry.durationMs);
      existing.avgDurationMs = roundMs(existing.totalDurationMs / existing.requestCount);
      existing.successRate = roundMs((existing.successCount / existing.requestCount) * 100);
    }

    for (const exporter of this.exporters) {
      exporter.onRequest?.(entry);
    }
  }

  recordSlowRequest(entry: SlowRequestEntry): void {
    this.slowRequests.push(entry);
    if (this.slowRequests.length > MAX_SLOW_LOGS) {
      this.slowRequests.shift();
    }
    for (const exporter of this.exporters) {
      exporter.onSlowRequest?.(entry);
    }
  }

  recordQuery(entry: PrismaQueryEntry): void {
    this.queryLogs.push(entry);
    if (this.queryLogs.length > MAX_QUERY_LOGS) {
      this.queryLogs.shift();
    }

    this.queryCount += 1;
    this.totalDatabaseTimeMs += entry.durationMs;
    if (entry.durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      this.slowQueryCount += 1;
    }

    const patternStats = this.queryPatterns.get(entry.normalizedQuery);
    if (!patternStats) {
      this.queryPatterns.set(entry.normalizedQuery, {
        pattern: entry.normalizedQuery,
        count: 1,
        totalDurationMs: entry.durationMs,
        avgDurationMs: entry.durationMs,
      });
    } else {
      patternStats.count += 1;
      patternStats.totalDurationMs += entry.durationMs;
      patternStats.avgDurationMs = roundMs(patternStats.totalDurationMs / patternStats.count);
    }

    for (const exporter of this.exporters) {
      exporter.onQuery?.(entry);
    }
  }

  recordNPlusOne(warning: NPlusOneWarning): void {
    this.nPlusOneWarnings.push(warning);
    if (this.nPlusOneWarnings.length > MAX_N_PLUS_ONE) {
      this.nPlusOneWarnings.shift();
    }
  }

  recordError(entry: Omit<ErrorEntry, 'id' | 'timestamp'>): ErrorEntry {
    const full: ErrorEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.errors.push(full);
    if (this.errors.length > MAX_ERRORS) {
      this.errors.shift();
    }
    for (const exporter of this.exporters) {
      exporter.onError?.(full);
    }
    return full;
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const totalRequests = this.requestLogs.length;
    const totalDuration = this.requestLogs.reduce((sum, r) => sum + r.durationMs, 0);
    const avgResponseTimeMs = totalRequests > 0 ? roundMs(totalDuration / totalRequests) : 0;
    const slowRequestCount = this.slowRequests.length;
    const errorCount = this.errors.length;

    let systemHealth: SystemHealthStatus = 'healthy';
    if (slowRequestCount > 10 || this.failedRequestCount > 20 || errorCount > 50) {
      systemHealth = 'degraded';
    }
    if (slowRequestCount > 50 || this.failedRequestCount > 100 || errorCount > 200) {
      systemHealth = 'critical';
    }

    return {
      totalRequests,
      avgResponseTimeMs,
      slowRequestCount,
      failedRequestCount: this.failedRequestCount,
      totalDatabaseTimeMs: roundMs(this.totalDatabaseTimeMs),
      errorCount,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      systemHealth,
    };
  }

  getEndpointMetrics(): ApiEndpointMetrics[] {
    return [...this.endpointMetrics.values()].sort(
      (a, b) => b.avgDurationMs - a.avgDurationMs,
    );
  }

  getSlowRequests(limit = 50): SlowRequestEntry[] {
    return [...this.slowRequests].reverse().slice(0, limit);
  }

  getRecentRequests(limit = 50): RequestLogEntry[] {
    return [...this.requestLogs].reverse().slice(0, limit);
  }

  getDatabaseMetrics(connectionStatus: SystemHealthStatus = 'healthy'): DatabaseMetrics {
    const repeatedQueryPatterns = [...this.queryPatterns.values()]
      .filter((p) => p.count > 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const slowQueries = [...this.queryLogs]
      .filter((q) => q.durationMs >= SLOW_QUERY_THRESHOLD_MS)
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 50);

    return {
      queryCount: this.queryCount,
      slowQueryCount: this.slowQueryCount,
      totalQueryTimeMs: roundMs(this.totalDatabaseTimeMs),
      avgQueryTimeMs: this.queryCount > 0 ? roundMs(this.totalDatabaseTimeMs / this.queryCount) : 0,
      connectionStatus,
      slowQueries,
      repeatedQueryPatterns,
      nPlusOneWarnings: [...this.nPlusOneWarnings].reverse().slice(0, 50),
    };
  }

  getErrors(limit = 50): ErrorEntry[] {
    return [...this.errors].reverse().slice(0, limit);
  }

  getRequestTimeline(requestId: string): RequestTimeline | null {
    const request = this.requestLogs.find((r) => r.requestId === requestId);
    if (!request) return null;

    const queries = this.queryLogs.filter((q) => q.requestId === requestId);
    return {
      requestId: request.requestId,
      method: request.method,
      route: request.route,
      phases: request.phases,
      totalMs: request.durationMs,
      queries,
    };
  }

  getSlowApiThreshold(): number {
    return SLOW_API_THRESHOLD_MS;
  }

  getNPlusOneThreshold(): number {
    return N_PLUS_ONE_THRESHOLD;
  }
}

export const metricsStore = new MetricsStore();

export function buildRouteLabel(method: string, originalUrl: string): string {
  const path = originalUrl.split('?')[0] ?? originalUrl;
  return `${method} ${normalizeRoutePath(path)}`;
}
