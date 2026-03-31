import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, type FieldError } from "../errors/app-error.js";
import { logger } from "../logger.js";
import { isProduction } from "../env.js";

/**
 * Central async error handler for Express.
 * Handles Zod validation errors, AppErrors, and unexpected exceptions
 * with a consistent JSON response shape.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── Zod validation failures ──────────────────────────────────────────
  if (err instanceof ZodError) {
    const details: FieldError[] = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    res.status(400).json({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed.",
      details,
    });
    return;
  }

  // ── Known application errors ─────────────────────────────────────────
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      status: err.statusCode,
      code: err.code,
      message: err.message,
    };
    if (err.details?.length) {
      body["details"] = err.details;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  // ── Unexpected errors ────────────────────────────────────────────────
  logger.error(err, "Unhandled error");
  res.status(500).json({
    status: 500,
    code: "INTERNAL_ERROR",
    message: isProduction ? "Internal server error." : err.message,
  });
}
