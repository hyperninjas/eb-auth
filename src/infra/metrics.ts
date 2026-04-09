import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

/**
 * Prometheus metrics registry. Exposes process-level metrics (event loop
 * lag, GC duration, RSS, file descriptors, etc.) plus application
 * counters/histograms defined below.
 *
 * Mounted at /metrics in app.ts. In production, gate this endpoint to
 * internal traffic (network policy, basic auth, or a separate port).
 */
export const registry = new Registry();

// Default Node process metrics — costs near zero, gives huge visibility.
collectDefaultMetrics({
  register: registry,
  prefix: "eb_auth_",
});

// ── HTTP request metrics ────────────────────────────────────────────────

/**
 * Total HTTP requests received, labeled by method, route template, and
 * status code class. Use a *route template* (`/api/devices/:id`) not the
 * raw path — otherwise high-cardinality URL params blow up Prometheus.
 */
export const httpRequestsTotal = new Counter({
  name: "eb_auth_http_requests_total",
  help: "Total number of HTTP requests received.",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

/**
 * Request duration histogram. The buckets are tuned for an authenticated
 * API: most requests should land under 100 ms, slow ones under 1 s.
 */
export const httpRequestDuration = new Histogram({
  name: "eb_auth_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});
