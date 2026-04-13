import { Router, type Request, type Response } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { validate, type ValidatedRequest } from "../../middleware/validate";
import type { WeatherClient } from "./weather.client";
import {
  weatherForecastQuerySchema,
  type WeatherForecastQuery,
  type WeatherForecastResponse,
} from "./weather.openapi";

/**
 * Weather forecast routes — proxy to Open-Meteo API with caching.
 *
 * Every route requires an authenticated user.
 * Cache is checked first; cache miss falls back to live API call.
 */

export interface CreateWeatherRouterDeps {
  client: WeatherClient;
}

export function createWeatherRouter(deps: CreateWeatherRouterDeps): Router {
  const router = Router();

  // Every weather route requires an authenticated user.
  router.use(authGuard);

  // ── GET /forecast?latitude=51.5074&longitude=-0.1278
  // Note: Weather data is NOT cached — forecasts change frequently and users
  // expect real-time data. Every request hits the Open-Meteo API.
  router.get(
    "/forecast",
    validate({ query: weatherForecastQuerySchema }),
    asyncHandler(async (req: Request, res: Response<WeatherForecastResponse>): Promise<void> => {
      const { latitude, longitude } = (req as ValidatedRequest<unknown, WeatherForecastQuery>)
        .validated.query;

      // Always fetch fresh data from Open-Meteo API.
      const forecast = await deps.client.fetchForecast({
        latitude,
        longitude,
      });

      res.json(forecast);
    }),
  );

  return router;
}
