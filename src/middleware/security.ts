import type { Request, Response, NextFunction, RequestHandler } from "express";
import helmet from "helmet";

const sharedHelmetOptions = {
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-origin" as const },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" as const },
};

/** Helmet config for the Scalar API reference docs (needs CDN + inline). */
export const docsHelmet: RequestHandler = helmet({
  ...sharedHelmetOptions,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
      ],
      imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://api.scalar.com"],
      fontSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://fonts.gstatic.com",
        "https://fonts.googleapis.com",
        "https://fonts.scalar.com",
      ],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
});

/** Strict helmet for everything else. */
export const strictHelmet: RequestHandler = helmet({
  ...sharedHelmetOptions,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
});

/**
 * Paths that need the relaxed CSP: any UI that loads the Scalar API
 * reference bundle from `cdn.jsdelivr.net` and uses inline scripts.
 *
 *   /api/auth/reference  → Better Auth's built-in Scalar reference for
 *                          the auth routes (served by Better Auth itself)
 *   /api/docs            → Our own Scalar reference for the application
 *                          OpenAPI document (mounted in src/http/app.ts)
 *
 * Match by prefix because Scalar fetches sub-paths under /api/docs for
 * its own assets (e.g. /api/docs/openapi.json could be served on demand).
 *
 * Everything else falls through to the strict CSP which forbids inline
 * scripts and third-party hosts.
 */
const DOCS_PATH_PREFIXES = ["/api/auth/reference", "/api/docs"];

export function security(req: Request, res: Response, next: NextFunction): void {
  const isDocs = DOCS_PATH_PREFIXES.some(
    (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
  );
  if (isDocs) {
    docsHelmet(req, res, next);
    return;
  }
  strictHelmet(req, res, next);
}
