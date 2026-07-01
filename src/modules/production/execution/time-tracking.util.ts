import type { WorkflowTaskExecutionIntervalType } from '@prisma/client';

export function durationSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

export function accumulateDuration(
  intervalType: WorkflowTaskExecutionIntervalType,
  seconds: number,
  totals: {
    workingDurationSeconds: number;
    pausedDurationSeconds: number;
    holdDurationSeconds: number;
  },
): typeof totals {
  if (intervalType === 'WORKING') {
    return { ...totals, workingDurationSeconds: totals.workingDurationSeconds + seconds };
  }
  if (intervalType === 'PAUSED') {
    return { ...totals, pausedDurationSeconds: totals.pausedDurationSeconds + seconds };
  }
  return { ...totals, holdDurationSeconds: totals.holdDurationSeconds + seconds };
}

export function computeTotalDuration(totals: {
  workingDurationSeconds: number;
  pausedDurationSeconds: number;
  holdDurationSeconds: number;
}): number {
  return (
    totals.workingDurationSeconds + totals.pausedDurationSeconds + totals.holdDurationSeconds
  );
}

export function liveElapsedSeconds(
  activeIntervalStartedAt: Date | null,
  now: Date,
): number {
  if (!activeIntervalStartedAt) return 0;
  return durationSeconds(activeIntervalStartedAt, now);
}
