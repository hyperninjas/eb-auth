import type { Request, Response, NextFunction } from "express";
import { httpRequestDuration, httpRequestsTotal } from "../infra/metrics";

/**
 * Records request duration + count for every HTTP request.
 *
 * Uses `req.route?.path` (the matched route template like `/:id`) instead
 * of `req.path` (the raw URL) so cardinality stays bounded — otherwise
 * every unique device id becomes its own time series and Prometheus
 * eventually OOMs.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startNs = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;

    // Prefer the matched route template; fall back to "unknown" so
    // 404s and unmatched paths don't pollute the metric.
    // Express types `req.route` as `any`, so we read it through a fully
    // typed local interface to keep the metric labels strictly bounded.
    interface MatchedRoute {
      path?: string;
    }
    const matchedRoute = (req as { route?: MatchedRoute }).route;
    const routePath = matchedRoute?.path;
    const route = routePath ? `${req.baseUrl}${routePath}` : "unknown";

    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSec);
  });

  next();
}
