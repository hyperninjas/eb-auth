import { DomainError } from "../../errors/domain";
import { type AppError, serviceUnavailable, badRequest } from "../../errors/app-error";

/**
 * Open-Meteo upstream API error.
 */
export class WeatherUpstreamError extends DomainError {
  readonly kind = "WeatherUpstreamError" as const;
  constructor(
    public readonly statusCode: number,
    public readonly upstreamBody?: string,
  ) {
    super(`Weather API returned ${statusCode}.`);
  }
}

/**
 * Map weather domain errors to HTTP error responses.
 */
export function mapWeatherDomainError(err: unknown): AppError | undefined {
  if (err instanceof WeatherUpstreamError) {
    // 4xx from Weather API = likely bad input (invalid coordinates).
    // 5xx = Weather service is down — surface as 503 so the client retries.
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return badRequest("Weather forecast request failed. Check your coordinates and try again.");
    }
    return serviceUnavailable("Weather service temporarily unavailable. Please try again later.");
  }

  return undefined;
}
