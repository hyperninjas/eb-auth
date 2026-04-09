import { ERROR_CODES, type ErrorCode, type FieldError } from "../http/openapi-shared";

export type { FieldError };

/**
 * Structured application error with HTTP status, machine-readable code,
 * and optional field-level validation details.
 *
 * The serialised shape (status, code, message, details, requestId) is
 * defined by `errorResponseSchema` in `src/http/openapi-shared.ts` —
 * `errorHandler` constructs that shape from this class with a `satisfies`
 * clause, so AppError's properties stay aligned with the schema.
 *
 * Use the factory functions below (`notFound`, `unauthorized`, etc.)
 * instead of `new AppError(...)` directly — they enforce the
 * status-code ↔ error-code pairing in one place.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = "AppError";
    // Restore the prototype chain. Required when `extends Error` is
    // compiled to ES5 (Babel, ts < target ES2015) — without it,
    // `instanceof AppError` silently fails and every AppError becomes a
    // generic 500 in `errorHandler`. Free insurance against future
    // build-target changes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Factory helpers ────────────────────────────────────────────────────────
//
// Each factory pairs an HTTP status with the matching error code. This is
// the ONLY place those pairs are defined — every other piece of code
// throws via these helpers, never via `new AppError(...)`. That guarantees
// the (status, code) pair never drifts.

export function badRequest(message: string, details?: FieldError[]): AppError {
  return new AppError(400, ERROR_CODES.BAD_REQUEST, message, details);
}

export function unauthorized(message = "Unauthorized."): AppError {
  return new AppError(401, ERROR_CODES.UNAUTHORIZED, message);
}

export function forbidden(message = "Forbidden."): AppError {
  return new AppError(403, ERROR_CODES.FORBIDDEN, message);
}

export function notFound(message: string): AppError {
  return new AppError(404, ERROR_CODES.NOT_FOUND, message);
}

export function conflict(message: string): AppError {
  return new AppError(409, ERROR_CODES.CONFLICT, message);
}

export function gatewayTimeout(message = "Upstream request timed out."): AppError {
  return new AppError(504, ERROR_CODES.UPSTREAM_TIMEOUT, message);
}

export function serviceUnavailable(
  message = "Service temporarily unavailable.",
  code: ErrorCode = ERROR_CODES.SERVICE_UNAVAILABLE,
): AppError {
  return new AppError(503, code, message);
}
