import type { Request } from 'express';
import { performanceLogger } from '../logs/performance-logger.js';
import type { RequestPhaseTimings } from './types.js';
import { getRequestContext, getRequestOperations } from './request-context.js';

function formatBreakdownLine(label: string, ms: number): string {
  return `${label}: ${ms}ms`;
}

/** Logs a human-readable per-request performance breakdown (always to performance log). */
export function logRequestBreakdown(input: {
  req: Request;
  method: string;
  route: string;
  durationMs: number;
  phases: RequestPhaseTimings;
  statusCode: number;
}): void {
  const ctx = getRequestContext(input.req);
  if (!ctx) return;

  const operations = getRequestOperations(input.req)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 15);

  const lines = [
    `${input.method} ${input.route}`,
    '',
    formatBreakdownLine('Validation', input.phases.validationMs),
    formatBreakdownLine('Authentication', input.phases.authenticationMs),
    formatBreakdownLine('Database (sum of queries)', input.phases.databaseMs),
    formatBreakdownLine('Business logic (residual)', input.phases.businessLogicMs),
    formatBreakdownLine('Serialization', input.phases.responseMs),
    formatBreakdownLine('Total', input.durationMs),
    '',
    `Query count: ${ctx.queries.length}`,
  ];

  if (operations.length > 0) {
    lines.push('', 'Top operations:');
    for (const op of operations) {
      lines.push(`  ${op.label}: ${op.durationMs}ms [${op.category}]`);
    }
  }

  performanceLogger.info('request_breakdown', {
    requestId: ctx.requestId,
    method: input.method,
    route: input.route,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    phases: input.phases,
    queryCount: ctx.queries.length,
    breakdown: lines.join('\n'),
    topOperations: operations,
  });
}
