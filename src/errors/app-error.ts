/**
 * Structured application error with HTTP status, machine-readable code,
 * and optional field-level validation details.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface FieldError {
  field: string;
  message: string;
}

// ── Factory helpers ────────────────────────────────────────────────────────

export function badRequest(message: string, details?: FieldError[]): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function notFound(message: string): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "CONFLICT", message);
}
