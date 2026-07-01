import {
  HEATMAP_THRESHOLDS,
  type HeatmapLevel,
  TERMINAL_TASK_STATUSES,
} from './control-center.constants.js';

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export function computeHeatmapLevel(activeWorkload: number, delayed: number): HeatmapLevel {
  if (delayed >= HEATMAP_THRESHOLDS.redDelayed || activeWorkload >= HEATMAP_THRESHOLDS.redWorkload) {
    return 'RED';
  }
  if (delayed >= HEATMAP_THRESHOLDS.yellowDelayed || activeWorkload >= HEATMAP_THRESHOLDS.yellowWorkload) {
    return 'YELLOW';
  }
  return 'GREEN';
}

export function isTerminalTaskStatus(status: string): boolean {
  return (TERMINAL_TASK_STATUSES as readonly string[]).includes(status);
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function averageSeconds(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function userDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
