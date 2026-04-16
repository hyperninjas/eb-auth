/**
 * HTTP controllers for the energy-profile module.
 *
 * Pure request -> service -> response adapters. No business logic.
 */

import type { Request, Response } from "express";
import type { ValidatedRequest } from "../../middleware/validate";
import type { createEnergyProfileService } from "./energy-profile.service";
import type {
  CreateProfileInput,
  CreateLoadProfileInput,
  UpdateLoadProfileInput,
  UpdateHardwareInput,
  ProviderIdParam,
  TariffQuery,
  SolarForecastQuery,
} from "./energy-profile.schema";
import type {
  PropertyProfileDTO,
  EpcHistoryDTO,
  EnergyProviderDTO,
  EnergyTariffDTO,
  UserLoadProfileDTO,
  OnboardingStatusDTO,
  ForecastSummaryDTO,
} from "./energy-profile.dto";
import type { SolarForecastResult } from "./engines/solar-forecast.engine";
import type { CostImpactResult } from "./engines/cost-impact.engine";
import type { TariffCheckerResult } from "./engines/tariff-checker.engine";
import type { HeatPumpResult } from "./engines/heat-pump.engine";

type Service = ReturnType<typeof createEnergyProfileService>;

export function createEnergyProfileController(service: Service) {
  return {
    // ── Onboarding Status ─────────────────────────────────────────

    getStatus: async (req: Request, res: Response<OnboardingStatusDTO>): Promise<void> => {
      const result = await service.getStatus(req.user!.id);
      res.json(result);
    },

    getDashboard: async (req: Request, res: Response): Promise<void> => {
      const result = await service.getDashboard(req.user!.id);
      res.json(result);
    },

    // ── Profile ───────────────────────────────────────────────────

    createProfile: async (req: Request, res: Response<PropertyProfileDTO>): Promise<void> => {
      const { lmkKey } = (req as ValidatedRequest<CreateProfileInput>).validated.body;
      const result = await service.createProfile(req.user!.id, lmkKey);
      res.status(201).json(result);
    },

    getProfile: async (req: Request, res: Response<PropertyProfileDTO>): Promise<void> => {
      const result = await service.getProfile(req.user!.id);
      res.json(result);
    },

    refreshProfile: async (req: Request, res: Response<PropertyProfileDTO>): Promise<void> => {
      const result = await service.refreshProfile(req.user!.id);
      res.json(result);
    },

    deleteProfile: async (req: Request, res: Response): Promise<void> => {
      await service.deleteProfile(req.user!.id);
      res.status(204).end();
    },

    updateHardware: async (req: Request, res: Response<PropertyProfileDTO>): Promise<void> => {
      const body = (req as ValidatedRequest<UpdateHardwareInput>).validated.body;
      const result = await service.updateHardware(req.user!.id, body);
      res.json(result);
    },

    getHistory: async (req: Request, res: Response<EpcHistoryDTO[]>): Promise<void> => {
      const result = await service.getHistory(req.user!.id);
      res.json(result);
    },

    // ── Tariffs ───────────────────────────────────────────────────

    listProviders: async (_req: Request, res: Response<EnergyProviderDTO[]>): Promise<void> => {
      const result = await service.listProviders();
      res.json(result);
    },

    listTariffs: async (req: Request, res: Response): Promise<void> => {
      const query = (req as ValidatedRequest<unknown, TariffQuery>).validated.query;
      const result = await service.listTariffs(query);
      res.json(result);
    },

    listTariffsByProvider: async (
      req: Request,
      res: Response<EnergyTariffDTO[]>,
    ): Promise<void> => {
      const { providerId } = (req as ValidatedRequest<unknown, unknown, ProviderIdParam>).validated
        .params;
      const result = await service.listTariffsByProvider(providerId);
      res.json(result);
    },

    refreshTariffs: async (_req: Request, res: Response): Promise<void> => {
      const result = await service.refreshTariffs();
      res.json(result);
    },

    // ── Load Profile ──────────────────────────────────────────────

    createLoadProfile: async (req: Request, res: Response<UserLoadProfileDTO>): Promise<void> => {
      const body = (req as ValidatedRequest<CreateLoadProfileInput>).validated.body;
      const result = await service.createLoadProfile(req.user!.id, body);
      res.status(201).json(result);
    },

    getLoadProfile: async (req: Request, res: Response<UserLoadProfileDTO>): Promise<void> => {
      const result = await service.getLoadProfile(req.user!.id);
      res.json(result);
    },

    updateLoadProfile: async (req: Request, res: Response<UserLoadProfileDTO>): Promise<void> => {
      const body = (req as ValidatedRequest<UpdateLoadProfileInput>).validated.body;
      const result = await service.updateLoadProfile(req.user!.id, body);
      res.json(result);
    },

    // ── Forecasts ─────────────────────────────────────────────────

    getSolarForecast: async (req: Request, res: Response<SolarForecastResult>): Promise<void> => {
      const query = (req as ValidatedRequest<unknown, SolarForecastQuery>).validated.query;
      const overrides =
        query.capacityKwp || query.panelCount
          ? { capacityKwp: query.capacityKwp, panelCount: query.panelCount }
          : undefined;
      const result = await service.getSolarForecast(req.user!.id, overrides);
      res.json(result);
    },

    getCostImpact: async (req: Request, res: Response<CostImpactResult>): Promise<void> => {
      const result = await service.getCostImpact(req.user!.id);
      res.json(result);
    },

    getTariffComparison: async (
      req: Request,
      res: Response<TariffCheckerResult>,
    ): Promise<void> => {
      const result = await service.getTariffComparison(req.user!.id);
      res.json(result);
    },

    getHeatPumpSimulation: async (req: Request, res: Response<HeatPumpResult>): Promise<void> => {
      const result = await service.getHeatPumpSimulation(req.user!.id);
      res.json(result);
    },

    getForecastSummary: async (req: Request, res: Response<ForecastSummaryDTO>): Promise<void> => {
      const result = await service.getForecastSummary(req.user!.id);
      res.json(result);
    },
  };
}
