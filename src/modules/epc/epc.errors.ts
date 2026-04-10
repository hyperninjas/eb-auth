import { DomainError } from "../../errors/domain";
import { type AppError, serviceUnavailable, badRequest } from "../../errors/app-error";

/**
 * EPC module domain errors.
 *
 * The module has one domain error: the upstream EPC API returned a
 * non-2xx response. The DomainError → AppError mapping lives HERE so
 * deleting the module folder removes everything cleanly.
 */

export class EpcUpstreamError extends DomainError {
  readonly kind = "EpcUpstreamError" as const;
  constructor(
    public readonly statusCode: number,
    public readonly upstreamBody?: string,
  ) {
    super(`EPC API returned ${statusCode}.`);
  }
}

export function mapEpcDomainError(err: unknown): AppError | undefined {
  if (err instanceof EpcUpstreamError) {
    // 4xx from EPC API = likely bad input (invalid postcode format).
    // 5xx = EPC service is down — surface as 503 so the client retries.
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return badRequest("EPC lookup failed. Check the postcode and try again.");
    }
    return serviceUnavailable("EPC service temporarily unavailable. Please try again.");
  }
  return undefined;
}
