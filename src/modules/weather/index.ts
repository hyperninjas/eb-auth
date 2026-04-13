import type { AppModule } from "../index";
import { loadWeatherConfig } from "./weather.config";
import { createWeatherClient } from "./weather.client";
import { createWeatherRouter } from "./weather.routes";
import { mapWeatherDomainError } from "./weather.errors";
import { weatherPaths } from "./weather.openapi";

/**
 * Weather module — proxies 7-day weather forecasts from Open-Meteo API.
 *
 * Mounted at /api/weather/*, auth-required, no caching.
 * Weather forecasts change frequently — every request fetches fresh data
 * from Open-Meteo. Disabled when WEATHER_ENABLED=false (returns null, zero module setup).
 */
export function createWeatherModule(): AppModule | null {
  const config = loadWeatherConfig();
  if (!config) return null;

  const client = createWeatherClient(config);
  const router = createWeatherRouter({ client });

  return {
    mountPath: "/api/weather",
    router,
    openapi: weatherPaths,
    mapDomainError: mapWeatherDomainError,
  };
}

export type { WeatherConfig } from "./weather.config";
export type { WeatherClient, WeatherForecast, DailyForecast } from "./weather.client";
export type { WeatherForecastQuery, WeatherForecastResponse } from "./weather.openapi";
