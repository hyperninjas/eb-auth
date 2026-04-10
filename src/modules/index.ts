import type { Router } from "express";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import type { AppError } from "../errors/app-error";
import type { DomainError } from "../errors/domain";
import { authRouter } from "./auth";
import { devicesPaths, devicesRouter } from "./devices";
import { healthRouter } from "./health";

// ── Optional integration modules ──────────────────────────────────────────
// Each block below registers an OPTIONAL third-party integration module.
// Removing the integration is a 3-line change: delete the import, delete
// the conditional push, delete the module folder under `src/modules/<m>`.
// No core file (env.ts, error-handler.ts, app.ts) needs to be touched.
import { createShopModule } from "./shop";
import { createEpcModule } from "./epc";

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
  /**
   * Optional self-registered domain-error mapper. Returning `undefined`
   * means "this module doesn't recognise this error, try the next one".
   *
   * Why this exists: third-party integration modules (shop/medusa,
   * future payment/notification/etc.) must NOT require edits to the
   * central error handler when they're added or removed. This hook lets
   * each module ship its own DomainError → AppError mapping inside the
   * module folder, so deleting the folder cleanly removes everything.
   */
  mapDomainError?: (err: DomainError) => AppError | undefined;
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

// ── Mount optional integration modules ───────────────────────────────────
// Each integration module decides for itself (via its own env validation)
// whether it should activate. `createXModule()` returns `null` when the
// integration is disabled, so the registry stays empty for that slot
// without any other file knowing the module exists.
const optionalModules: AppModule[] = [];

const shop = createShopModule();
if (shop) optionalModules.push(shop);

const epc = createEpcModule();
if (epc) optionalModules.push(epc);

modules.push(...optionalModules);
