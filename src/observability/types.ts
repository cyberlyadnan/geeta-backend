export type SystemHealthStatus = 'healthy' | 'degraded' | 'critical';

export type ErrorCategory = 'api' | 'validation' | 'database' | 'unhandled';

export interface RequestPhaseTimings {
  validationMs: number;
  businessLogicMs: number;
  databaseMs: number;
  responseMs: number;
}

export interface RequestLogEntry {
  requestId: string;
  method: string;
  url: string;
  route: string;
  statusCode: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  userId?: string;
  phases: RequestPhaseTimings;
}

export interface SlowRequestEntry extends RequestLogEntry {
  thresholdMs: number;
}

export interface ApiEndpointMetrics {
  method: string;
  route: string;
  requestCount: number;
  errorCount: number;
  successCount: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  successRate: number;
}

export interface PerformanceMetrics {
  totalRequests: number;
  avgResponseTimeMs: number;
  slowRequestCount: number;
  failedRequestCount: number;
  totalDatabaseTimeMs: number;
  errorCount: number;
  uptimeSeconds: number;
  systemHealth: SystemHealthStatus;
}

export interface PrismaQueryEntry {
  id: string;
  query: string;
  normalizedQuery: string;
  durationMs: number;
  params: string;
  timestamp: string;
  requestId?: string;
  error?: string;
}

export interface QueryPatternStats {
  pattern: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

export interface NPlusOneWarning {
  requestId: string;
  pattern: string;
  count: number;
  timestamp: string;
  route?: string;
}

export interface DatabaseMetrics {
  queryCount: number;
  slowQueryCount: number;
  totalQueryTimeMs: number;
  avgQueryTimeMs: number;
  connectionStatus: SystemHealthStatus;
  slowQueries: PrismaQueryEntry[];
  repeatedQueryPatterns: QueryPatternStats[];
  nPlusOneWarnings: NPlusOneWarning[];
}

export interface ErrorEntry {
  id: string;
  category: ErrorCategory;
  message: string;
  stack?: string;
  statusCode?: number;
  path?: string;
  method?: string;
  requestId?: string;
  userId?: string;
  timestamp: string;
}

export interface RequestTimeline {
  requestId: string;
  method: string;
  route: string;
  phases: RequestPhaseTimings;
  totalMs: number;
  queries: PrismaQueryEntry[];
}

/** Pluggable exporter for Prometheus / OpenTelemetry / Datadog */
export interface MetricsExporter {
  readonly name: string;
  onRequest?(entry: RequestLogEntry): void;
  onSlowRequest?(entry: SlowRequestEntry): void;
  onError?(entry: ErrorEntry): void;
  onQuery?(entry: PrismaQueryEntry): void;
}
