import type { MetricsExporter } from '../types.js';

/**
 * Stub exporter — wire to Prometheus pushgateway, OTLP, or Datadog agent without
 * changing core observability code. Register via metricsStore.registerExporter().
 */
export const noopMetricsExporter: MetricsExporter = {
  name: 'noop',
};
