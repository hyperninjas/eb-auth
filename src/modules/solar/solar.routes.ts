import { Router, type Request, type Response } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { validate, type ValidatedRequest } from "../../middleware/validate";
import { getLogger } from "../../infra/logger";
import type { SolarClient } from "./solar.client";
import type { SolarCache } from "./solar.cache";
import {
  solarForecastQuerySchema,
  type SolarForecastQuery,
  type SolarForecastResponse,
} from "./solar.openapi";
import { generateSolarCacheKey } from "./solar.cache";

/**
 * Solar forecast routes — proxy to Quartz Solar API with caching.
 *
 * Every route requires an authenticated user.
 * Cache is checked first; cache miss falls back to live API call.
 */

export interface CreateSolarRouterDeps {
  client: SolarClient;
  cache: SolarCache;
}

export function createSolarRouter(deps: CreateSolarRouterDeps): Router {
  const router = Router();

  // Every solar route requires an authenticated user.
  router.use(authGuard);

  // ── GET /forecast?latitude=51.5074&longitude=-0.1278&capacityKwp=5&tilt=30&orientation=180
  router.get(
    "/forecast",
    validate({ query: solarForecastQuerySchema }),
    asyncHandler(async (req: Request, res: Response<SolarForecastResponse>): Promise<void> => {
      const { latitude, longitude, capacityKwp, tilt, orientation } = (
        req as ValidatedRequest<unknown, SolarForecastQuery>
      ).validated.query;

      // Generate a stable cache key from parameters.
      const cacheKey = generateSolarCacheKey({
        latitude,
        longitude,
        capacityKwp,
        tilt,
        orientation,
      });

      // Check cache first.
      const cached = await deps.cache.getCachedForecast(cacheKey);
      if (cached) {
        getLogger().debug({ latitude, longitude }, "Solar forecast cache hit");
        res.json(cached);
        return;
      }

      // Cache miss — call the Quartz Solar API.
      const forecast = await deps.client.fetchForecast({
        latitude,
        longitude,
        capacityKwp,
        tilt,
        orientation,
      });

      // Cache the response (fire-and-forget).
      void deps.cache.setCachedForecast(cacheKey, forecast);

      res.json(forecast);
    }),
  );

  return router;
}
