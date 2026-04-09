import type { Request, Response, NextFunction } from "express";
import { serviceUnavailable } from "../errors/app-error";
import { ERROR_CODES } from "../http/openapi-shared";

/**
 * Module-level shutdown flag. Set by the bootstrap on SIGTERM/SIGINT;
 * read by both `drainMiddleware` and `/readyz` so the LB stops sending
 * traffic *and* in-flight new requests get a clean 503 instead of being
 * silently dropped when the server closes.
 */
let isDraining = false;

/** Mark the process as draining — called from the graceful shutdown path. */
export function startDraining(): void {
  isDraining = true;
}

/** Cheap accessor for health checks. */
export function isShuttingDown(): boolean {
  return isDraining;
}

/**
 * Express middleware that responds 503 + `Connection: close` for any new
 * request received after `startDraining()` is called. Combined with the
 * readiness probe flipping to 503, this gives the load balancer two
 * independent signals to stop routing traffic to this pod.
 *
 * Mount this BEFORE any route handler — first thing after the request id
 * middleware so even health probes from misbehaving load balancers get
 * the drain signal.
 *
 * The 503 response is produced by THROWING through the central error
 * handler (not `res.json()` directly), so the body shape matches every
 * other error response in the API.
 */
export function drainMiddleware(_req: Request, res: Response, next: NextFunction): void {
  if (!isDraining) {
    next();
    return;
  }
  // Hint to HTTP/1.1 clients (and most load balancers) to not reuse the
  // connection — speeds up draining considerably.
  res.set("Connection", "close");
  next(
    serviceUnavailable(
      "Server is shutting down. Please retry in a moment.",
      ERROR_CODES.SHUTTING_DOWN,
    ),
  );
}
