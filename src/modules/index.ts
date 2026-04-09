import type { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { authRouter } from "./auth";
import { devicesPaths, devicesRouter } from "./devices";
import { healthRouter } from "./health";

/**
 * Module registry — single source of truth for which feature modules are
 * mounted on the app.
 *
 * Why a registry instead of importing each router directly in `app.ts`:
 *   - Adding a new module is a *one-line* change (vs. editing
 *     `createApp()`, the OpenAPI builder, and possibly tests).
 *   - The OpenAPI document and the Express app iterate the same array,
 *     so they can never drift out of sync.
 *   - Tests can spin up a subset of modules by filtering the array.
 */
export interface AppModule {
  /** URL prefix the router mounts under (e.g. "/api/devices"). */
  mountPath: string;
  /** Express router exposing the module's HTTP endpoints. */
  router: Router;
  /** OpenAPI paths for this module — merged into the global doc. */
  openapi?: ZodOpenApiPathsObject;
  /**
   * If true, body parsers are NOT applied before this module. Required
   * for routers that need raw bodies (Better Auth's catch-all). Most
   * modules should leave this false.
   */
  rawBody?: boolean;
  /**
   * If true, the global rate limiter is NOT applied before this module.
   * Use for health/readiness probes that must remain reachable under
   * any traffic conditions — k8s probes should never be rate-limited,
   * and the rate limiter itself depends on Redis (so a Redis outage
   * would otherwise mean health probes can't tell anyone Redis is down).
   */
  bypassRateLimit?: boolean;
}

/**
 * The mounted modules. Order matters: rawBody modules MUST come before
 * the body parsers in `createApp()`. Health module is mounted globally
 * (no prefix) so its routes are reachable at `/livez`, `/readyz`, etc.
 */
export const modules: AppModule[] = [
  {
    // Health probes: bypass the rate limiter so k8s liveness/readiness
    // never get throttled and so the readiness probe can still report
    // "Redis is down" when, well, Redis is down (the rate limiter would
    // otherwise fail-open onto every request — including /readyz —
    // before the route handler gets a chance to do its check).
    mountPath: "/",
    router: healthRouter,
    bypassRateLimit: true,
  },
  {
    // Better Auth catch-all. `rawBody: true` mounts this BEFORE the
    // express.json() body parser in `createApp()` — Better Auth reads
    // the raw request stream itself and breaks if it's already consumed.
    mountPath: "/api/auth",
    router: authRouter,
    rawBody: true,
  },
  {
    mountPath: "/api/devices",
    router: devicesRouter,
    openapi: devicesPaths,
  },
];
