import type { AppModule } from "../index";
import { loadSolarConfig } from "./solar.config";
import { createSolarClient } from "./solar.client";
import { createSolarCache } from "./solar.cache";
import { createSolarRouter } from "./solar.routes";
import { mapSolarDomainError } from "./solar.errors";
import { solarPaths } from "./solar.openapi";

/**
 * Solar module — proxies 48-hour solar forecasts from Quartz Solar API.
 *
 * Mounted at /api/solar/*, auth-required, Redis-cached.
 * Disabled when SOLAR_ENABLED=false (returns null, zero module setup).
 */
export function createSolarModule(): AppModule | null {
  const config = loadSolarConfig();
  if (!config) return null;

  const client = createSolarClient(config);
  const cache = createSolarCache(config);
  const router = createSolarRouter({ client, cache });

  return {
    mountPath: "/api/solar",
    router,
    openapi: solarPaths,
    mapDomainError: mapSolarDomainError,
  };
}

export type { SolarConfig } from "./solar.config";
export type { SolarClient, SolarForecast, SolarForecastEntry } from "./solar.client";
export type { SolarCache } from "./solar.cache";
export type { SolarForecastQuery, SolarForecastResponse } from "./solar.openapi";
