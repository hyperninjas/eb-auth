import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import { apiReference } from "@scalar/express-api-reference";
import { env, isProduction } from "../config/env";
import { requestContext } from "../middleware/request-context";
import { httpLogger } from "../middleware/http-logger";
import { security } from "../middleware/security";
import { globalLimiter } from "../middleware/rate-limit";
import { errorHandler } from "../middleware/error-handler";
import { drainMiddleware } from "../middleware/drain";
import { metricsMiddleware } from "../middleware/metrics";
import { notFound } from "../errors/app-error";
import { modules } from "../modules";
import { buildOpenApiDocument } from "./openapi";
import { registry as metricsRegistry } from "../infra/metrics";

/**
 * Builds and returns the Express application. No `listen` call here so the
 * same app can be reused by tests (supertest) and the production bootstrap.
 *
 * Middleware order matters — read top to bottom:
 *   1.  request-context — assigns req id, opens AsyncLocalStorage scope
 *   2.  drain           — 503 new requests during shutdown
 *   3.  http-logger     — logs every request with the req id from #1
 *   4.  metrics         — records duration + count for every request
 *   5.  security        — strict CSP / HSTS / CORP / CORS pre-headers
 *   6.  cors            — allow-list configured via env
 *   7.  bypassRateLimit modules (health probes) — mounted BEFORE the
 *       rate limiter so probes can never be throttled and so /readyz
 *       can still report on Redis when Redis is the thing that's down
 *   8.  global rate limit — Redis-backed per-IP limiter (cluster-wide)
 *   9.  modules with rawBody=true (auth catch-all needs the raw body)
 *   10. body parsers    — JSON / URL-encoded with size caps
 *   11. hpp             — HTTP Parameter Pollution protection
 *   12. cookieParser    — for non-auth routes that read cookies
 *   13. regular modules — feature routers from src/modules/index.ts
 *   14. /metrics, /api/docs, /api/openapi.json
 *   15. 404 handler
 *   16. global error handler
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // Trust proxy hops — behind a single LB use 1, Cloudflare → ALB → app
  // would be 2, etc. Configurable via env so it doesn't drift between
  // environments.
  if (isProduction) app.set("trust proxy", env.TRUST_PROXY);

  // ── 1. Per-request id + AsyncLocalStorage scope (must be first) ──
  app.use(requestContext);

  // ── 2. Drain (503 new requests during graceful shutdown) ──
  app.use(drainMiddleware);

  // ── 3. HTTP request logger (uses the request id from #1) ──
  app.use(httpLogger);

  // ── 4. Prometheus request metrics ──
  app.use(metricsMiddleware);

  // ── 5. Security headers ──
  app.use(security);

  // ── 6. CORS ──
  // Comma-separated origin list from env, parsed to an array.
  const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
      exposedHeaders: ["x-request-id"],
      credentials: true,
      maxAge: 600,
    }),
  );

  // ── 7. Modules that bypass the rate limiter (health probes) ──
  // Mounted BEFORE globalLimiter so k8s probes are never throttled and
  // /readyz can still report on Redis health when Redis is the thing
  // that's failing.
  for (const m of modules) {
    if (m.bypassRateLimit) app.use(m.mountPath, m.router);
  }

  // ── 8. Global rate limit (Redis-backed) ──
  app.use(globalLimiter);

  // ── 9. Modules that need raw bodies (mounted BEFORE body parsers) ──
  for (const m of modules) {
    if (m.rawBody) app.use(m.mountPath, m.router);
  }

  // ── 10. Body parsers (size-limited) ──
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));

  // ── 11. HTTP Parameter Pollution protection ──
  app.use(hpp());

  // ── 12. Cookie parser ──
  app.use(cookieParser());

  // ── 13. Regular feature modules (not bypass + not rawBody) ──
  for (const m of modules) {
    if (!m.rawBody && !m.bypassRateLimit) app.use(m.mountPath, m.router);
  }

  // ── 13. OpenAPI spec + Scalar reference UI ──
  //        /api/openapi.json → raw OpenAPI 3.1 document
  //        /api/docs         → Scalar interactive reference
  // Built from the same `modules` registry, so they can never drift.
  const openApiDoc = buildOpenApiDocument();
  app.get("/api/openapi.json", (_req: Request, res: Response) => {
    res.json(openApiDoc);
  });
  app.use(
    "/api/docs",
    apiReference({
      url: "/api/openapi.json",
      theme: "default",
    }),
  );

  // ── 14. Prometheus scrape endpoint ──
  // In production, gate this to internal traffic via network policy or
  // a separate listener — currently any caller can fetch metrics.
  app.get("/metrics", (_req: Request, res: Response): void => {
    void (async () => {
      res.set("Content-Type", metricsRegistry.contentType);
      res.send(await metricsRegistry.metrics());
    })();
  });

  // ── 15. 404 handler ──
  // Throws via the central error handler so the 404 body shape matches
  // every other error response in the API (rather than a one-off
  // `{ error: "Not found" }` envelope nothing else uses).
  app.use((req: Request, _res: Response, next): void => {
    next(notFound(`Route not found: ${req.method} ${req.originalUrl}`));
  });

  // ── 16. Global error handler ──
  app.use(errorHandler);

  return app;
}
