const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

const ONE_DAY_MS = UNIT_MS.d;

/**
 * Parses duration strings like "15m", "7d" to milliseconds.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const value = Number(match[1]);
  const unitKey = match[2] as keyof typeof UNIT_MS;
  const multiplier = UNIT_MS[unitKey];
  if (multiplier === undefined) {
    throw new Error(`Invalid duration unit: ${match[2]}`);
  }
  return value * multiplier;
}

/**
 * Ensures JWT-style durations are at least the given minimum (default 1 day).
 * Returns normalized duration string e.g. "1d", "7d".
 */
export function enforceMinDuration(duration: string, minMs = ONE_DAY_MS): string {
  const ms = parseDurationToMs(duration);
  if (ms >= minMs) return duration;

  const days = Math.ceil(minMs / ONE_DAY_MS);
  return `${days}d`;
}
