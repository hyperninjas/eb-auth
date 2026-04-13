import { DomainError } from "../../errors/domain";
import { type AppError, serviceUnavailable, badRequest } from "../../errors/app-error";

/**
 * Quartz Solar upstream API error.
 */
export class SolarUpstreamError extends DomainError {
  readonly kind = "SolarUpstreamError" as const;
  constructor(
    public readonly statusCode: number,
    public readonly upstreamBody?: string,
  ) {
    super(`Solar API returned ${statusCode}.`);
  }
}

/**
 * Map solar domain errors to HTTP error responses.
 */
export function mapSolarDomainError(err: unknown): AppError | undefined {
  if (err instanceof SolarUpstreamError) {
    // 4xx from Solar API = likely bad input (invalid coordinates).
    // 5xx = Solar service is down — surface as 503 so the client retries.
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return badRequest("Solar forecast request failed. Check your coordinates and try again.");
    }
    return serviceUnavailable("Solar API is temporarily unavailable. Please try again later.");
  }

  return undefined;
}
