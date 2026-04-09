import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";
import { AppError, conflict, gatewayTimeout, notFound } from "../errors/app-error";
import { DomainError, DeviceNotFoundError } from "../errors/domain";
import { ERROR_CODES, type ErrorResponse, type FieldError } from "../http/openapi-shared";
import { getLogger } from "../infra/logger";
import { getRequestId } from "../infra/request-context";
import { isProduction } from "../config/env";

/**
 * Central error handler.
 *
 * The complete pipeline:
 *
 *   anything thrown    →  this handler
 *   ────────────────────────────────────
 *   ZodError           →  400 VALIDATION_ERROR + field details
 *   PrismaP2002        →  409 CONFLICT
 *   AbortError/timeout →  504 UPSTREAM_TIMEOUT
 *   DomainError        →  mapped to AppError via mapDomainError()
 *   AppError           →  serialised as-is (factory-built, codes safe)
 *   anything else      →  500 INTERNAL_ERROR (logged in full)
 *
 * Every response body is `... satisfies ErrorResponse`, so the runtime
 * shape and the OpenAPI document `errorResponseSchema` cannot drift.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = getRequestId();

  // ── Zod validation ────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const details: FieldError[] = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    const body = {
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Request validation failed.",
      details,
      requestId,
    } satisfies ErrorResponse;
    res.status(400).json(body);
    return;
  }

  // ── Prisma unique-constraint → 409 Conflict ───────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.["target"] as string[] | undefined) ?? [];
    const field = target[0] ?? "field";
    sendAppError(res, conflict(`A record with this ${field} already exists.`), requestId);
    return;
  }

  // ── AbortError / TimeoutError → 504 Gateway Timeout ──────────────
  // Triggered by `AbortSignal.timeout(...)` on outbound HTTP calls.
  // Without this branch the failure would surface as 500, mis-attributing
  // the bug to us when it's actually upstream.
  if (isAbortOrTimeoutError(err)) {
    sendAppError(res, gatewayTimeout(), requestId);
    return;
  }

  // ── Domain errors (HTTP-agnostic) → mapped to AppError ───────────
  if (err instanceof DomainError) {
    sendAppError(res, mapDomainError(err), requestId);
    return;
  }

  // ── Known application errors ──────────────────────────────────────
  if (err instanceof AppError) {
    sendAppError(res, err, requestId);
    return;
  }

  // ── Unexpected ────────────────────────────────────────────────────
  // Log with the request id so the JSON `requestId` returned to the
  // client matches a log line we can find later.
  getLogger().error({ err }, "Unhandled error");
  const message = err instanceof Error ? err.message : "Unknown error";
  const body = {
    status: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: isProduction ? "Internal server error." : message,
    requestId,
  } satisfies ErrorResponse;
  res.status(500).json(body);
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Serialises an `AppError` into the wire shape and writes it. Centralised
 * so the (status, code, message, requestId, details) projection happens
 * exactly once.
 */
function sendAppError(res: Response, err: AppError, requestId: string | undefined): void {
  const body = {
    status: err.statusCode,
    code: err.code,
    message: err.message,
    requestId,
    ...(err.details?.length ? { details: err.details } : {}),
  } satisfies ErrorResponse;
  res.status(err.statusCode).json(body);
}

/**
 * Maps a domain error to an HTTP-shaped `AppError`. New domain errors get
 * a branch here — keeping the mapping in one place means the service
 * layer can throw freely without ever importing HTTP concepts.
 */
function mapDomainError(err: DomainError): AppError {
  if (err instanceof DeviceNotFoundError) {
    return notFound(err.message);
  }
  // Fallback: treat unmapped domain errors as 500 to avoid leaking
  // internal class names through a generic message.
  return new AppError(500, ERROR_CODES.INTERNAL_ERROR, err.message);
}

/**
 * `AbortSignal.timeout(...)` rejects with a `DOMException` whose `name` is
 * `"AbortError"` or `"TimeoutError"` depending on the runtime version.
 * `fetch` propagates these unchanged.
 */
function isAbortOrTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}
