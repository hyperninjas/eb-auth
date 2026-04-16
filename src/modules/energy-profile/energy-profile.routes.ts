/**
 * Express router for the energy-profile module.
 *
 * All routes require authentication. Validation middleware runs before
 * controllers so handlers receive strongly-typed `req.validated`.
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { validate } from "../../middleware/validate";
import {
  createProfileSchema,
  updateHardwareSchema,
  createLoadProfileSchema,
  updateLoadProfileSchema,
  providerIdParamSchema,
  tariffQuerySchema,
  solarForecastQuerySchema,
} from "./energy-profile.schema";

/** Async route handler compatible with asyncHandler(). */
type RouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Explicit controller interface — avoids deep ReturnType inference that
 *  the IDE's TS server struggles to resolve through the service chain. */
export interface EnergyProfileController {
  getStatus: RouteHandler;
  getDashboard: RouteHandler;
  createProfile: RouteHandler;
  getProfile: RouteHandler;
  refreshProfile: RouteHandler;
  deleteProfile: RouteHandler;
  updateHardware: RouteHandler;
  getHistory: RouteHandler;
  listProviders: RouteHandler;
  listTariffs: RouteHandler;
  listTariffsByProvider: RouteHandler;
  refreshTariffs: RouteHandler;
  createLoadProfile: RouteHandler;
  getLoadProfile: RouteHandler;
  updateLoadProfile: RouteHandler;
  getSolarForecast: RouteHandler;
  getCostImpact: RouteHandler;
  getTariffComparison: RouteHandler;
  getHeatPumpSimulation: RouteHandler;
  getForecastSummary: RouteHandler;
}

export function createEnergyProfileRouter(controller: EnergyProfileController): Router {
  const router = Router();

  // Every energy-profile route requires an authenticated user
  router.use(authGuard);

  // ── Onboarding Status + Dashboard ────────────────────────────────
  router.get("/status", asyncHandler(controller.getStatus));
  router.get("/dashboard", asyncHandler(controller.getDashboard));

  // ── Property Profile ────────────────────────────────────────────

  router.post(
    "/profile",
    validate({ body: createProfileSchema }),
    asyncHandler(controller.createProfile),
  );

  router.get("/profile", asyncHandler(controller.getProfile));

  router.post("/profile/refresh", asyncHandler(controller.refreshProfile));

  router.delete("/profile", asyncHandler(controller.deleteProfile));

  router.patch(
    "/profile/hardware",
    validate({ body: updateHardwareSchema }),
    asyncHandler(controller.updateHardware),
  );

  router.get("/profile/history", asyncHandler(controller.getHistory));

  // ── Tariffs ─────────────────────────────────────────────────────

  router.get(
    "/tariffs",
    validate({ query: tariffQuerySchema }),
    asyncHandler(controller.listTariffs),
  );

  router.get("/tariffs/providers", asyncHandler(controller.listProviders));

  router.get(
    "/tariffs/:providerId",
    validate({ params: providerIdParamSchema }),
    asyncHandler(controller.listTariffsByProvider),
  );

  router.post("/tariffs/refresh", asyncHandler(controller.refreshTariffs));

  // ── Load Profile ────────────────────────────────────────────────

  router.post(
    "/load-profile",
    validate({ body: createLoadProfileSchema }),
    asyncHandler(controller.createLoadProfile),
  );

  router.get("/load-profile", asyncHandler(controller.getLoadProfile));

  router.patch(
    "/load-profile",
    validate({ body: updateLoadProfileSchema }),
    asyncHandler(controller.updateLoadProfile),
  );

  // ── Forecast Functions ──────────────────────────────────────────

  router.get(
    "/forecast/solar",
    validate({ query: solarForecastQuerySchema }),
    asyncHandler(controller.getSolarForecast),
  );

  router.get("/forecast/cost-impact", asyncHandler(controller.getCostImpact));

  router.get("/forecast/tariff-comparison", asyncHandler(controller.getTariffComparison));

  router.get("/forecast/heat-pump", asyncHandler(controller.getHeatPumpSimulation));

  router.get("/forecast/summary", asyncHandler(controller.getForecastSummary));

  return router;
}
