import { DomainError } from "../../errors/domain";
import {
  type AppError,
  badRequest,
  notFound,
  conflict,
  serviceUnavailable,
} from "../../errors/app-error";

/**
 * Energy-profile module domain errors.
 *
 * Each error maps to an AppError in `mapEnergyProfileDomainError()`.
 * Deleting the module folder removes everything cleanly.
 */

export class PropertyProfileNotFoundError extends DomainError {
  readonly kind = "PropertyProfileNotFoundError" as const;
  constructor(public readonly userId: string) {
    super(`No property profile found for user ${userId}.`);
  }
}

export class PropertyProfileExistsError extends DomainError {
  readonly kind = "PropertyProfileExistsError" as const;
  constructor(public readonly userId: string) {
    super(`Property profile already exists for user ${userId}. Use refresh to update.`);
  }
}

export class LoadProfileNotFoundError extends DomainError {
  readonly kind = "LoadProfileNotFoundError" as const;
  constructor(public readonly profileId: string) {
    super(`No load profile found for property ${profileId}.`);
  }
}

export class TariffNotFoundError extends DomainError {
  readonly kind = "TariffNotFoundError" as const;
  constructor(public readonly id: string) {
    super(`Energy tariff ${id} not found.`);
  }
}

export class ProviderNotFoundError extends DomainError {
  readonly kind = "ProviderNotFoundError" as const;
  constructor(public readonly id: string) {
    super(`Energy provider ${id} not found.`);
  }
}

export class PvgisUpstreamError extends DomainError {
  readonly kind = "PvgisUpstreamError" as const;
  constructor(
    public readonly statusCode: number,
    public readonly upstreamBody?: string,
  ) {
    super(`PVGIS API returned ${statusCode}.`);
  }
}

export class OctopusUpstreamError extends DomainError {
  readonly kind = "OctopusUpstreamError" as const;
  constructor(
    public readonly statusCode: number,
    public readonly upstreamBody?: string,
  ) {
    super(`Octopus Energy API returned ${statusCode}.`);
  }
}

export class InsufficientDataError extends DomainError {
  readonly kind = "InsufficientDataError" as const;
  constructor(public readonly reason: string) {
    super(`Insufficient data for forecast: ${reason}`);
  }
}

export function mapEnergyProfileDomainError(err: unknown): AppError | undefined {
  if (err instanceof PropertyProfileNotFoundError) {
    return notFound(err.message);
  }
  if (err instanceof PropertyProfileExistsError) {
    return conflict(err.message);
  }
  if (err instanceof LoadProfileNotFoundError) {
    return notFound(err.message);
  }
  if (err instanceof TariffNotFoundError) {
    return notFound(err.message);
  }
  if (err instanceof ProviderNotFoundError) {
    return notFound(err.message);
  }
  if (err instanceof InsufficientDataError) {
    return badRequest(err.message);
  }
  if (err instanceof PvgisUpstreamError) {
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return badRequest("Solar irradiance lookup failed. Check coordinates.");
    }
    return serviceUnavailable("Solar irradiance service temporarily unavailable.");
  }
  if (err instanceof OctopusUpstreamError) {
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return badRequest("Tariff lookup failed.");
    }
    return serviceUnavailable("Tariff service temporarily unavailable.");
  }
  return undefined;
}
