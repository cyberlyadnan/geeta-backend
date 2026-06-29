export type SeedLogger = {
  info: (message: string) => void;
  step: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export function createSeedLogger(scope: string): SeedLogger {
  const prefix = `[seed:${scope}]`;
  return {
    info: (message) => console.log(`${prefix} ${message}`),
    step: (message) => console.log(`${prefix} → ${message}`),
    warn: (message) => console.warn(`${prefix} WARN ${message}`),
    error: (message) => console.error(`${prefix} ERROR ${message}`),
  };
}
