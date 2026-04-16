/**
 * Energy-profile service — orchestration layer.
 *
 * Coordinates between the EPC client, PVGIS client, Octopus client,
 * repository, cache, and pure calculation engines. All business logic
 * lives here; the controller is a thin HTTP adapter.
 *
 * Throws DomainError subclasses — never AppError (HTTP semantics stay
 * in the error mapper, not here).
 */

import { getLogger } from "../../infra/logger";
import type { EpcClient, EpcCertificate } from "../epc";
import type { EnergyProfileCache } from "./energy-profile.cache";
import type { EnergyProfileConfig } from "./energy-profile.config";
import type { PvgisClient } from "./clients/pvgis.client";
import type { OctopusClient } from "./clients/octopus.client";
import { energyProfileRepository } from "./energy-profile.repository";
import {
  PropertyProfileNotFoundError,
  PropertyProfileExistsError,
  LoadProfileNotFoundError,
  TariffNotFoundError,
  ProviderNotFoundError,
  InsufficientDataError,
} from "./energy-profile.errors";
import {
  toPropertyProfileDTO,
  toEpcHistoryDTO,
  toProviderDTO,
  toTariffDTO,
  toLoadProfileDTO,
  type PropertyProfileDTO,
  type EpcHistoryDTO,
  type EnergyProviderDTO,
  type EnergyTariffDTO,
  type UserLoadProfileDTO,
  type OnboardingStatusDTO,
  type ForecastSummaryDTO,
  type DashboardDTO,
} from "./energy-profile.dto";
import {
  extrapolateHardware,
  type HardwareExtrapolation,
  type HistoricalCert,
} from "./engines/hardware-extrapolation";
import { generateSolarForecast, type SolarForecastResult } from "./engines/solar-forecast.engine";
import { calculateCostImpact, type CostImpactResult } from "./engines/cost-impact.engine";
import {
  compareTariffs,
  DEFAULT_TOU_RATES,
  type TariffCheckerResult,
} from "./engines/tariff-checker.engine";
import { simulateHeatPump, type HeatPumpResult } from "./engines/heat-pump.engine";
import { distributeLoad } from "./data/uk-load-curve";
import { UK_PROVIDERS } from "./data/uk-providers-seed";
import type { UpdateHardwareInput, TariffQuery } from "./energy-profile.schema";

// ── Dependencies (injected at module creation time) ─────────────────

export interface EnergyProfileServiceDeps {
  epcClient: EpcClient;
  pvgisClient: PvgisClient;
  octopusClient: OctopusClient;
  cache: EnergyProfileCache;
  config: EnergyProfileConfig;
}

export function createEnergyProfileService(deps: EnergyProfileServiceDeps) {
  const { epcClient, pvgisClient, octopusClient, cache } = deps;

  return {
    // ── Onboarding Status ───────────────────────────────────────────

    async getStatus(userId: string): Promise<OnboardingStatusDTO> {
      const profile = await energyProfileRepository.findProfileByUserId(userId);
      const hasProfile = profile !== null;

      let hasLoadProfile = false;
      if (profile) {
        const lp = await energyProfileRepository.findLoadProfileByProfileId(profile.id);
        hasLoadProfile = lp !== null;
      }

      const readyForForecasts = hasProfile && hasLoadProfile;

      const nextSteps: string[] = [];
      if (!hasProfile) nextSteps.push("Search your postcode and select your property");
      if (profile && !profile.userVerified)
        nextSteps.push("Review and confirm your hardware details");
      if (hasProfile && !hasLoadProfile)
        nextSteps.push("Set your energy provider and monthly bill");

      let completionPercent = 0;
      if (hasProfile) completionPercent += 40;
      if (profile?.userVerified) completionPercent += 20;
      if (hasLoadProfile) completionPercent += 20;
      if (readyForForecasts) completionPercent += 20;

      return {
        hasProfile,
        hasLoadProfile,
        readyForForecasts,
        completionPercent,
        nextSteps,
        profileId: profile?.id ?? null,
      };
    },

    // ── Profile CRUD ────────────────────────────────────────────────

    async createProfile(userId: string, lmkKey: string): Promise<PropertyProfileDTO> {
      const existing = await energyProfileRepository.findProfileByUserId(userId);
      if (existing) throw new PropertyProfileExistsError(userId);

      const cert = await epcClient.getCertificate(lmkKey);
      if (!cert) throw new InsufficientDataError("Certificate not found for the given LMK key.");

      const uprn = cert["uprn"] ?? null;
      let historicalCerts: EpcCertificate[] = [];
      if (uprn) {
        const historyResult = await epcClient.searchByUprn(uprn);
        historicalCerts = historyResult.rows;
      }

      const historyInput = buildHistoricalCertInput(historicalCerts);
      const hardware = extrapolateHardware({
        propertyType: cert.propertyType ?? "",
        builtForm: cert.builtForm ?? "",
        totalFloorArea: parseFloat(cert.totalFloorArea) || 0,
        mainheatDescription: cert.mainheatDescription ?? "",
        photoSupply: cert["photoSupply"] ?? "",
        energyConsumptionCurrent: safeParseFloat(cert.energyConsumptionCurrent),
        history: historyInput,
      });

      const profile = await energyProfileRepository.createProfile({
        user: { connect: { id: userId } },
        uprn,
        lmkKey,
        address: cert.address ?? "",
        postcode: cert.postcode ?? "",
        propertyType: cert.propertyType ?? "",
        builtForm: cert.builtForm ?? "",
        totalFloorArea: parseFloat(cert.totalFloorArea) || 0,
        latestEpcData: cert as unknown as Record<string, string>,
        hardware: hardware as unknown as Record<string, string>,
      });

      for (const histCert of historicalCerts) {
        await energyProfileRepository.upsertHistory(profile.id, histCert.lmkKey, {
          lmkKey: histCert.lmkKey,
          inspectionDate: new Date(histCert.inspectionDate),
          lodgementDate: new Date(histCert.lodgementDate || histCert.inspectionDate),
          mainheatDescription: histCert.mainheatDescription ?? null,
          photoSupply: histCert["photoSupply"] ?? null,
          spaceHeatingDemand: safeParseFloat(histCert["spaceHeatingDemand"]),
          energyConsumptionCurrent: safeParseFloat(histCert.energyConsumptionCurrent),
          certificateData: histCert as unknown as Record<string, string>,
        });
      }

      const dto = toPropertyProfileDTO(profile, historicalCerts.length);
      void cache.setProfile(userId, JSON.stringify(dto));

      getLogger().info({ userId, lmkKey, uprn }, "Property profile created");
      return dto;
    },

    async getProfile(userId: string): Promise<PropertyProfileDTO> {
      const cached = await cache.getProfile(userId);
      if (cached) return JSON.parse(cached) as PropertyProfileDTO;

      const profile = await energyProfileRepository.findProfileByUserId(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const histCount = await energyProfileRepository.findHistoryByProfileId(profile.id);
      const dto = toPropertyProfileDTO(profile, histCount.length);
      void cache.setProfile(userId, JSON.stringify(dto));
      return dto;
    },

    async refreshProfile(userId: string): Promise<PropertyProfileDTO> {
      const existing = await energyProfileRepository.findProfileByUserId(userId);
      if (!existing) throw new PropertyProfileNotFoundError(userId);

      const cert = await epcClient.getCertificate(existing.lmkKey);
      if (!cert) throw new InsufficientDataError("Certificate no longer available.");

      const uprn = cert["uprn"] ?? existing.uprn;
      let historicalCerts: EpcCertificate[] = [];
      if (uprn) {
        const historyResult = await epcClient.searchByUprn(uprn);
        historicalCerts = historyResult.rows;
      }

      const historyInput = buildHistoricalCertInput(historicalCerts);
      const hardware = extrapolateHardware({
        propertyType: cert.propertyType ?? "",
        builtForm: cert.builtForm ?? "",
        totalFloorArea: parseFloat(cert.totalFloorArea) || 0,
        mainheatDescription: cert.mainheatDescription ?? "",
        photoSupply: cert["photoSupply"] ?? "",
        energyConsumptionCurrent: safeParseFloat(cert.energyConsumptionCurrent),
        history: historyInput,
      });

      await energyProfileRepository.deleteHistoryByProfileId(existing.id);
      const profile = await energyProfileRepository.updateProfile(existing.id, {
        uprn,
        address: cert.address ?? "",
        postcode: cert.postcode ?? "",
        propertyType: cert.propertyType ?? "",
        builtForm: cert.builtForm ?? "",
        totalFloorArea: parseFloat(cert.totalFloorArea) || 0,
        latestEpcData: cert as unknown as Record<string, string>,
        hardware: hardware as unknown as Record<string, string>,
        userVerified: false,
      });

      for (const histCert of historicalCerts) {
        await energyProfileRepository.upsertHistory(profile.id, histCert.lmkKey, {
          lmkKey: histCert.lmkKey,
          inspectionDate: new Date(histCert.inspectionDate),
          lodgementDate: new Date(histCert.lodgementDate || histCert.inspectionDate),
          mainheatDescription: histCert.mainheatDescription ?? null,
          photoSupply: histCert["photoSupply"] ?? null,
          spaceHeatingDemand: safeParseFloat(histCert["spaceHeatingDemand"]),
          energyConsumptionCurrent: safeParseFloat(histCert.energyConsumptionCurrent),
          certificateData: histCert as unknown as Record<string, string>,
        });
      }

      // Invalidate derived caches; setProfile overwrites the old entry
      // so a separate deleteProfile is not needed (avoids a race where
      // the delete fires after the set).
      void cache.deleteHistory(existing.id);
      void cache.invalidateForecasts(existing.id);

      const dto = toPropertyProfileDTO(profile, historicalCerts.length);
      void cache.setProfile(userId, JSON.stringify(dto));

      getLogger().info({ userId, lmkKey: existing.lmkKey }, "Property profile refreshed");
      return dto;
    },

    async deleteProfile(userId: string): Promise<void> {
      const existing = await energyProfileRepository.findProfileByUserId(userId);
      if (!existing) throw new PropertyProfileNotFoundError(userId);

      await energyProfileRepository.deleteProfile(userId);

      void cache.deleteProfile(userId);
      void cache.deleteHistory(existing.id);
      void cache.deleteLoadProfile(existing.id);
      void cache.invalidateForecasts(existing.id);

      getLogger().info({ userId }, "Property profile deleted");
    },

    // ── Hardware Correction ─────────────────────────────────────────

    async updateHardware(userId: string, input: UpdateHardwareInput): Promise<PropertyProfileDTO> {
      const profile = await energyProfileRepository.findProfileByUserId(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const current = (profile.hardware as HardwareExtrapolation | null) ?? {
        solar: {
          detected: false,
          birthDate: null,
          estimatedPanelCount: 0,
          estimatedPanelWattage: 0,
          panelTechnology: "",
          estimatedCapacityKwp: 0,
          confidence: "low" as const,
          manualSurveyRequired: false,
        },
        battery: { probability: 0, estimatedCapacityKwh: 0, recommendation: null },
        heatPump: {
          detected: false,
          birthDate: null,
          type: null,
          readiness: "unknown" as const,
          readinessScore: null,
        },
      };

      // Merge user corrections onto the existing extrapolation
      if (input.solar) {
        if (input.solar.detected !== undefined) current.solar.detected = input.solar.detected;
        if (input.solar.estimatedPanelCount !== undefined)
          current.solar.estimatedPanelCount = input.solar.estimatedPanelCount;
        if (input.solar.estimatedCapacityKwp !== undefined) {
          current.solar.estimatedCapacityKwp = input.solar.estimatedCapacityKwp;
        } else if (input.solar.estimatedPanelCount !== undefined) {
          // Recalculate capacity from panel count × existing wattage
          current.solar.estimatedCapacityKwp =
            (current.solar.estimatedPanelCount * current.solar.estimatedPanelWattage) / 1000;
        }
        current.solar.confidence = "high"; // User-verified = high confidence
      }
      if (input.battery) {
        if (input.battery.estimatedCapacityKwh !== undefined) {
          current.battery.estimatedCapacityKwh = input.battery.estimatedCapacityKwh;
          current.battery.probability = input.battery.estimatedCapacityKwh > 0 ? 1 : 0;
          current.battery.recommendation = null;
        }
      }
      if (input.heatPump) {
        if (input.heatPump.detected !== undefined)
          current.heatPump.detected = input.heatPump.detected;
        if (input.heatPump.type !== undefined) current.heatPump.type = input.heatPump.type;
      }

      const updated = await energyProfileRepository.updateProfile(profile.id, {
        hardware: current as unknown as Record<string, string>,
        userVerified: true,
      });

      // Invalidate caches — hardware changes affect all forecasts
      void cache.deleteProfile(userId);
      void cache.invalidateForecasts(profile.id);

      const histCount = await energyProfileRepository.findHistoryByProfileId(profile.id);
      const dto = toPropertyProfileDTO(updated, histCount.length);
      void cache.setProfile(userId, JSON.stringify(dto));

      getLogger().info({ userId }, "Hardware extrapolation updated by user");
      return dto;
    },

    async getHistory(userId: string): Promise<EpcHistoryDTO[]> {
      const profile = await energyProfileRepository.findProfileByUserId(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const cached = await cache.getHistory(profile.id);
      if (cached) return JSON.parse(cached) as EpcHistoryDTO[];

      const history = await energyProfileRepository.findHistoryByProfileId(profile.id);
      const dtos = history.map(toEpcHistoryDTO);
      void cache.setHistory(profile.id, JSON.stringify(dtos));
      return dtos;
    },

    // ── Tariffs (with filtering + pagination) ─���─────────────────────

    async listProviders(): Promise<EnergyProviderDTO[]> {
      const providers = await energyProfileRepository.listProvidersWithCount();
      return providers.map(toProviderDTO);
    },

    async listTariffs(
      query: TariffQuery,
    ): Promise<{
      data: EnergyTariffDTO[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }> {
      const { data, total } = await energyProfileRepository.listTariffsFiltered(query);
      return {
        data: data.map(toTariffDTO),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },

    async listTariffsByProvider(providerId: string): Promise<EnergyTariffDTO[]> {
      const provider = await energyProfileRepository.findProviderById(providerId);
      if (!provider) throw new ProviderNotFoundError(providerId);

      const tariffs = await energyProfileRepository.listTariffsByProvider(providerId);
      return tariffs.map((t) => toTariffDTO({ ...t, provider }));
    },

    async refreshTariffs(): Promise<{ providersUpserted: number; tariffsUpserted: number }> {
      let providersUpserted = 0;
      let tariffsUpserted = 0;
      const now = new Date();

      for (const seed of UK_PROVIDERS) {
        const provider = await energyProfileRepository.upsertProvider(seed.slug, seed.name);
        providersUpserted++;

        await energyProfileRepository.upsertTariff(provider.id, "Standard Variable Tariff", now, {
          name: "Standard Variable Tariff",
          tariffType: "flat",
          flatRatePence: seed.svt.flatRatePence,
          standingChargePence: seed.svt.standingChargePence,
          segExportRatePence: seed.svt.segExportRatePence,
          isDefault: true,
          validFrom: now,
          source: "ofgem_svt",
        });
        tariffsUpserted++;
      }

      try {
        const octopusTariffs = await octopusClient.getElectricityTariffs();
        const octopusProvider = await energyProfileRepository.findProviderBySlug("octopus-energy");
        if (octopusProvider) {
          for (const ot of octopusTariffs) {
            await energyProfileRepository.upsertTariff(
              octopusProvider.id,
              ot.displayName,
              new Date(ot.validFrom),
              {
                name: ot.displayName,
                tariffType: ot.registerType === "MULTI_REGISTER" ? "tou" : "flat",
                flatRatePence: ot.unitRatePence,
                standingChargePence: ot.standingChargePence,
                isDefault: false,
                validFrom: new Date(ot.validFrom),
                validTo: ot.validTo ? new Date(ot.validTo) : null,
                source: "octopus_api",
              },
            );
            tariffsUpserted++;
          }
        }
      } catch (err) {
        getLogger().warn({ err }, "Octopus tariff refresh failed, SVT data still updated");
      }

      getLogger().info({ providersUpserted, tariffsUpserted }, "Tariff refresh completed");
      return { providersUpserted, tariffsUpserted };
    },

    // ── Load Profile ──────────────────────────────────────────────

    async createLoadProfile(
      userId: string,
      input: { providerId: string; tariffId: string; monthlyBillPence: number },
    ): Promise<UserLoadProfileDTO> {
      const profile = await energyProfileRepository.findProfileByUserId(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const tariff = await energyProfileRepository.findTariffById(input.tariffId);
      if (!tariff) throw new TariffNotFoundError(input.tariffId);

      const provider = await energyProfileRepository.findProviderById(input.providerId);
      if (!provider) throw new ProviderNotFoundError(input.providerId);

      const dailyKwh = deriveDailyKwh(input.monthlyBillPence, tariff);
      const hourlyDistribution = distributeLoad(dailyKwh);

      const loadProfile = await energyProfileRepository.createLoadProfile({
        profile: { connect: { id: profile.id } },
        provider: { connect: { id: input.providerId } },
        tariff: { connect: { id: input.tariffId } },
        monthlyBillPence: input.monthlyBillPence,
        dailyKwh,
        hourlyDistribution,
      });

      void cache.invalidateForecasts(profile.id);

      return toLoadProfileDTO(loadProfile, provider.name, tariff.name);
    },

    async getLoadProfile(userId: string): Promise<UserLoadProfileDTO> {
      const profile = await energyProfileRepository.findProfileByUserId(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const loadProfile = await energyProfileRepository.findLoadProfileByProfileId(profile.id);
      if (!loadProfile) throw new LoadProfileNotFoundError(profile.id);

      return enrichLoadProfileDTO(loadProfile);
    },

    async updateLoadProfile(
      userId: string,
      input: {
        providerId?: string | undefined;
        tariffId?: string | undefined;
        monthlyBillPence?: number | undefined;
      },
    ): Promise<UserLoadProfileDTO> {
      const profile = await energyProfileRepository.findProfileByUserId(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const existing = await energyProfileRepository.findLoadProfileByProfileId(profile.id);
      if (!existing) throw new LoadProfileNotFoundError(profile.id);

      const tariffId = input.tariffId ?? existing.tariffId;
      const tariff = await energyProfileRepository.findTariffById(tariffId);
      if (!tariff) throw new TariffNotFoundError(tariffId);

      const providerId = input.providerId ?? existing.providerId;
      const provider = await energyProfileRepository.findProviderById(providerId);

      const monthlyBillPence = input.monthlyBillPence ?? existing.monthlyBillPence;
      const dailyKwh = deriveDailyKwh(monthlyBillPence, tariff);
      const hourlyDistribution = distributeLoad(dailyKwh);

      const updateData: Record<string, unknown> = {
        monthlyBillPence,
        dailyKwh,
        hourlyDistribution,
      };
      if (input.providerId) updateData["provider"] = { connect: { id: input.providerId } };
      if (input.tariffId) updateData["tariff"] = { connect: { id: input.tariffId } };

      const updated = await energyProfileRepository.updateLoadProfile(profile.id, updateData);
      void cache.invalidateForecasts(profile.id);

      return toLoadProfileDTO(updated, provider?.name ?? "Unknown", tariff.name);
    },

    // ── Dashboard Bundle ──────────────────────────────────────────

    async getDashboard(userId: string): Promise<DashboardDTO> {
      const status = await this.getStatus(userId);

      let profile: PropertyProfileDTO | null = null;
      let loadProfile: UserLoadProfileDTO | null = null;
      let forecasts: ForecastSummaryDTO | null = null;

      if (status.hasProfile) {
        try {
          profile = await this.getProfile(userId);
        } catch {
          /* swallow */
        }
        try {
          loadProfile = await this.getLoadProfile(userId);
        } catch {
          /* swallow — not set yet */
        }
      }

      if (status.readyForForecasts) {
        forecasts = await this.getForecastSummary(userId);
      }

      return { status, profile, loadProfile, forecasts };
    },

    // ── Forecast Functions ────────────────────────────────────────

    async getSolarForecast(userId: string): Promise<SolarForecastResult> {
      const profile = await energyProfileRepository.findProfileWithRelations(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const cached = await cache.getForecast(profile.id, "solar");
      if (cached) return JSON.parse(cached) as SolarForecastResult;

      const hardware = profile.hardware as HardwareExtrapolation | null;
      if (!hardware) throw new InsufficientDataError("Hardware extrapolation not available.");

      const capacityKwp = hardware.solar.estimatedCapacityKwp;
      if (capacityKwp <= 0)
        throw new InsufficientDataError(
          "No solar capacity estimated. Update your hardware details to add solar panels.",
        );

      const irradiance = await getOrFetchIrradiance(pvgisClient, profile.postcode);

      const result = generateSolarForecast({
        capacityKwp,
        monthlyIrradiance: irradiance.monthlyIrradiance as number[],
        latitude: irradiance.latitude,
      });

      void cache.setForecast(profile.id, "solar", JSON.stringify(result));
      return result;
    },

    async getCostImpact(userId: string): Promise<CostImpactResult> {
      const profile = await energyProfileRepository.findProfileWithRelations(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const cached = await cache.getForecast(profile.id, "cost");
      if (cached) return JSON.parse(cached) as CostImpactResult;

      const hardware = profile.hardware as HardwareExtrapolation | null;
      if (!hardware) throw new InsufficientDataError("Hardware extrapolation not available.");
      if (!profile.loadProfile)
        throw new InsufficientDataError("Set your energy provider and monthly bill first.");

      const loadCurve = profile.loadProfile.hourlyDistribution as number[];
      const tariff = await energyProfileRepository.findTariffById(profile.loadProfile.tariffId);
      if (!tariff) throw new TariffNotFoundError(profile.loadProfile.tariffId);

      const irradiance = await getOrFetchIrradiance(pvgisClient, profile.postcode);
      const solarForecast = generateSolarForecast({
        capacityKwp: hardware.solar.estimatedCapacityKwp,
        monthlyIrradiance: irradiance.monthlyIrradiance as number[],
        latitude: irradiance.latitude,
      });
      const solarCurve = weightedAnnualSolarCurve(solarForecast.seasons);

      const result = calculateCostImpact({
        solarCurve,
        loadCurve,
        batteryCapacityKwh: hardware.battery.estimatedCapacityKwh,
        tariff: {
          flatRatePence: (tariff.flatRatePence ?? 2450) / 100,
          standingChargePence: tariff.standingChargePence / 100,
          segExportRatePence: (tariff.segExportRatePence ?? 1500) / 100,
        },
      });

      void cache.setForecast(profile.id, "cost", JSON.stringify(result));
      return result;
    },

    async getTariffComparison(userId: string): Promise<TariffCheckerResult> {
      const profile = await energyProfileRepository.findProfileWithRelations(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const cached = await cache.getForecast(profile.id, "tariff");
      if (cached) return JSON.parse(cached) as TariffCheckerResult;

      const hardware = profile.hardware as HardwareExtrapolation | null;
      if (!hardware) throw new InsufficientDataError("Hardware extrapolation not available.");
      if (!profile.loadProfile)
        throw new InsufficientDataError("Set your energy provider and monthly bill first.");

      const loadCurve = profile.loadProfile.hourlyDistribution as number[];
      const tariff = await energyProfileRepository.findTariffById(profile.loadProfile.tariffId);
      if (!tariff) throw new TariffNotFoundError(profile.loadProfile.tariffId);

      const irradiance = await getOrFetchIrradiance(pvgisClient, profile.postcode);
      const solarForecast = generateSolarForecast({
        capacityKwp: hardware.solar.estimatedCapacityKwp,
        monthlyIrradiance: irradiance.monthlyIrradiance as number[],
        latitude: irradiance.latitude,
      });
      const solarCurve = weightedAnnualSolarCurve(solarForecast.seasons);

      const result = compareTariffs({
        loadCurve,
        solarCurve,
        batteryCapacityKwh: hardware.battery.estimatedCapacityKwh,
        svtRatePence: (tariff.flatRatePence ?? 2450) / 100,
        svtStandingChargePence: tariff.standingChargePence / 100,
        segExportRatePence: (tariff.segExportRatePence ?? 1500) / 100,
        touRates: {
          ...DEFAULT_TOU_RATES,
          offPeakRatePence: DEFAULT_TOU_RATES.offPeakRatePence / 100,
          standardRatePence: DEFAULT_TOU_RATES.standardRatePence / 100,
          peakRatePence: DEFAULT_TOU_RATES.peakRatePence / 100,
          standingChargePence: DEFAULT_TOU_RATES.standingChargePence / 100,
        },
      });

      void cache.setForecast(profile.id, "tariff", JSON.stringify(result));
      return result;
    },

    async getHeatPumpSimulation(userId: string): Promise<HeatPumpResult> {
      const profile = await energyProfileRepository.findProfileWithRelations(userId);
      if (!profile) throw new PropertyProfileNotFoundError(userId);

      const cached = await cache.getForecast(profile.id, "heatpump");
      if (cached) return JSON.parse(cached) as HeatPumpResult;

      const hardware = profile.hardware as HardwareExtrapolation | null;
      if (!hardware) throw new InsufficientDataError("Hardware extrapolation not available.");
      if (!profile.loadProfile)
        throw new InsufficientDataError("Set your energy provider and monthly bill first.");

      const loadCurve = profile.loadProfile.hourlyDistribution as number[];
      const tariff = await energyProfileRepository.findTariffById(profile.loadProfile.tariffId);
      if (!tariff) throw new TariffNotFoundError(profile.loadProfile.tariffId);

      const epcData = profile.latestEpcData as Record<string, string>;
      // Prefer the dedicated space heating demand field. If missing, use
      // ~70% of total energy consumption (typical UK gas-heated home).
      // Fall back to 12 000 kWh (UK average) if both are absent.
      const spaceHeatingDemand =
        safeParseFloat(epcData["spaceHeatingDemand"]) ??
        ((safeParseFloat(epcData["energyConsumptionCurrent"]) ?? 0) * 0.7 || null) ??
        12000;

      const irradiance = await getOrFetchIrradiance(pvgisClient, profile.postcode);
      const solarForecast = generateSolarForecast({
        capacityKwp: hardware.solar.estimatedCapacityKwp,
        monthlyIrradiance: irradiance.monthlyIrradiance as number[],
        latitude: irradiance.latitude,
      });
      const solarCurve = weightedAnnualSolarCurve(solarForecast.seasons);

      const result = simulateHeatPump({
        annualSpaceHeatingDemandKwh: spaceHeatingDemand,
        loadCurve,
        solarCurve,
        batteryCapacityKwh: hardware.battery.estimatedCapacityKwh,
        svtRatePence: (tariff.flatRatePence ?? 2450) / 100,
        svtStandingChargePence: tariff.standingChargePence / 100,
        segExportRatePence: (tariff.segExportRatePence ?? 1500) / 100,
        touRates: {
          ...DEFAULT_TOU_RATES,
          offPeakRatePence: DEFAULT_TOU_RATES.offPeakRatePence / 100,
          standardRatePence: DEFAULT_TOU_RATES.standardRatePence / 100,
          peakRatePence: DEFAULT_TOU_RATES.peakRatePence / 100,
          standingChargePence: DEFAULT_TOU_RATES.standingChargePence / 100,
        },
      });

      void cache.setForecast(profile.id, "heatpump", JSON.stringify(result));
      return result;
    },

    async getForecastSummary(userId: string): Promise<ForecastSummaryDTO> {
      const [solar, costImpact, tariffComparison, heatPump] = await Promise.allSettled([
        this.getSolarForecast(userId),
        this.getCostImpact(userId),
        this.getTariffComparison(userId),
        this.getHeatPumpSimulation(userId),
      ]);

      return {
        solar: solar.status === "fulfilled" ? solar.value : null,
        costImpact: costImpact.status === "fulfilled" ? costImpact.value : null,
        tariffComparison: tariffComparison.status === "fulfilled" ? tariffComparison.value : null,
        heatPump: heatPump.status === "fulfilled" ? heatPump.value : null,
        errors: {
          solar: solar.status === "rejected" ? extractErrorMessage(solar.reason) : null,
          costImpact:
            costImpact.status === "rejected" ? extractErrorMessage(costImpact.reason) : null,
          tariffComparison:
            tariffComparison.status === "rejected"
              ? extractErrorMessage(tariffComparison.reason)
              : null,
          heatPump: heatPump.status === "rejected" ? extractErrorMessage(heatPump.reason) : null,
        },
      };
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Produce a day-weighted annual average solar curve from per-season data.
 *
 * Summer: ~92 days, Winter: ~90 days, Shoulder: ~183 days = 365 total.
 * Each hour is the weighted average across all three season curves.
 */
function weightedAnnualSolarCurve(seasons: { season: string; hourlyCurve: number[] }[]): number[] {
  const SEASON_DAYS: Record<string, number> = { summer: 92, winter: 90, shoulder: 183 };
  const curve = new Array<number>(24).fill(0);

  for (const s of seasons) {
    const days = SEASON_DAYS[s.season] ?? 0;
    for (let h = 0; h < 24; h++) {
      curve[h]! += (s.hourlyCurve[h] ?? 0) * days;
    }
  }

  // Divide by 365 to get the average daily curve
  for (let h = 0; h < 24; h++) {
    curve[h]! /= 365;
  }

  return curve;
}

function extractErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

/**
 * Derive daily kWh from monthly bill and tariff.
 *
 * Handles both flat and ToU tariffs correctly:
 * - Flat: bill / days / flatRate
 * - ToU: bill / days / weightedAverageRate (peak/off-peak weighted by
 *   typical UK usage pattern: ~30% off-peak, ~40% standard, ~30% peak)
 */
function deriveDailyKwh(
  monthlyBillPence: number,
  tariff: {
    flatRatePence: number | null;
    peakRatePence: number | null;
    offPeakRatePence: number | null;
    standingChargePence: number;
    tariffType: string;
  },
): number {
  const dailyBillPence = monthlyBillPence / 30.44;
  // Subtract standing charge to get the energy-only portion
  const dailyEnergyCostPence = Math.max(0, dailyBillPence - tariff.standingChargePence / 100);

  if (tariff.tariffType === "tou" && tariff.peakRatePence && tariff.offPeakRatePence) {
    // Time-of-Use: weighted average of off-peak (30%), standard (40%), peak (30%)
    // Standard rate is the flat rate or midpoint between peak and off-peak
    const standardRate = tariff.flatRatePence
      ? tariff.flatRatePence / 100
      : (tariff.peakRatePence + tariff.offPeakRatePence) / 2 / 100;
    const weightedRate =
      (tariff.offPeakRatePence / 100) * 0.3 +
      standardRate * 0.4 +
      (tariff.peakRatePence / 100) * 0.3;
    return weightedRate > 0 ? dailyEnergyCostPence / weightedRate : 0;
  }

  // Flat tariff
  const ratePence = (tariff.flatRatePence ?? tariff.peakRatePence ?? 2450) / 100;
  return ratePence > 0 ? dailyEnergyCostPence / ratePence : 0;
}

/** Enrich a load profile with provider and tariff display names. */
async function enrichLoadProfileDTO(
  lp: { providerId: string; tariffId: string } & Parameters<typeof toLoadProfileDTO>[0],
): Promise<UserLoadProfileDTO> {
  const [provider, tariff] = await Promise.all([
    energyProfileRepository.findProviderById(lp.providerId),
    energyProfileRepository.findTariffById(lp.tariffId),
  ]);
  return toLoadProfileDTO(lp, provider?.name ?? "Unknown", tariff?.name ?? "Unknown");
}

/** Parse a float, returning null for NaN/undefined/empty — unlike
 *  `parseFloat(x) || null` which incorrectly treats `0` as null. */
function safeParseFloat(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function buildHistoricalCertInput(certs: EpcCertificate[]): HistoricalCert[] {
  return certs
    .filter((c) => c.inspectionDate)
    .sort((a, b) => a.inspectionDate.localeCompare(b.inspectionDate))
    .map((c) => ({
      lmkKey: c.lmkKey,
      inspectionDate: c.inspectionDate,
      mainheatDescription: c.mainheatDescription ?? null,
      photoSupply: c["photoSupply"] ?? null,
      energyConsumptionCurrent: safeParseFloat(c.energyConsumptionCurrent),
    }));
}

async function getOrFetchIrradiance(
  pvgisClient: PvgisClient,
  postcode: string,
): Promise<{ latitude: number; longitude: number; monthlyIrradiance: unknown }> {
  const { lat, lng } = approximatePostcodeCoords(postcode);
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;

  const existing = await energyProfileRepository.findIrradiance(roundedLat, roundedLng);
  if (existing) {
    return {
      latitude: roundedLat,
      longitude: roundedLng,
      monthlyIrradiance: existing.monthlyIrradiance,
    };
  }

  const result = await pvgisClient.getIrradiance(roundedLat, roundedLng);

  await energyProfileRepository.upsertIrradiance(roundedLat, roundedLng, {
    monthlyIrradiance: result.monthlyIrradiance,
    optimalAngle: result.optimalAngle,
    annualYieldKwhPerKwp: result.annualYieldKwhPerKwp,
  });

  return {
    latitude: roundedLat,
    longitude: roundedLng,
    monthlyIrradiance: result.monthlyIrradiance,
  };
}

function approximatePostcodeCoords(postcode: string): { lat: number; lng: number } {
  const area = postcode.replace(/\s+/g, "").slice(0, 2).toUpperCase();

  const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
    AB: { lat: 57.15, lng: -2.09 },
    AL: { lat: 51.75, lng: -0.34 },
    B: { lat: 52.48, lng: -1.89 },
    BA: { lat: 51.38, lng: -2.36 },
    BB: { lat: 53.75, lng: -2.48 },
    BD: { lat: 53.79, lng: -1.75 },
    BH: { lat: 50.72, lng: -1.88 },
    BL: { lat: 53.58, lng: -2.43 },
    BN: { lat: 50.83, lng: -0.14 },
    BR: { lat: 51.41, lng: 0.01 },
    BS: { lat: 51.45, lng: -2.58 },
    BT: { lat: 54.6, lng: -5.93 },
    CA: { lat: 54.89, lng: -2.93 },
    CB: { lat: 52.2, lng: 0.12 },
    CF: { lat: 51.48, lng: -3.18 },
    CH: { lat: 53.19, lng: -2.89 },
    CM: { lat: 51.73, lng: 0.47 },
    CO: { lat: 51.89, lng: 0.89 },
    CR: { lat: 51.37, lng: -0.1 },
    CT: { lat: 51.28, lng: 1.08 },
    CV: { lat: 52.41, lng: -1.51 },
    CW: { lat: 53.1, lng: -2.44 },
    DA: { lat: 51.45, lng: 0.21 },
    DD: { lat: 56.46, lng: -2.97 },
    DE: { lat: 52.92, lng: -1.47 },
    DH: { lat: 54.78, lng: -1.57 },
    DL: { lat: 54.52, lng: -1.56 },
    DN: { lat: 53.52, lng: -1.13 },
    DT: { lat: 50.71, lng: -2.44 },
    DY: { lat: 52.51, lng: -2.08 },
    E: { lat: 51.55, lng: -0.05 },
    EC: { lat: 51.52, lng: -0.09 },
    EH: { lat: 55.95, lng: -3.19 },
    EN: { lat: 51.65, lng: -0.08 },
    EX: { lat: 50.72, lng: -3.53 },
    FK: { lat: 56.12, lng: -3.94 },
    FY: { lat: 53.81, lng: -3.05 },
    G: { lat: 55.86, lng: -4.25 },
    GL: { lat: 51.86, lng: -2.24 },
    GU: { lat: 51.24, lng: -0.77 },
    HA: { lat: 51.58, lng: -0.34 },
    HD: { lat: 53.64, lng: -1.78 },
    HG: { lat: 53.99, lng: -1.54 },
    HP: { lat: 51.75, lng: -0.74 },
    HR: { lat: 52.06, lng: -2.72 },
    HU: { lat: 53.74, lng: -0.33 },
    HX: { lat: 53.73, lng: -1.86 },
    IG: { lat: 51.56, lng: 0.08 },
    IP: { lat: 52.06, lng: 1.16 },
    IV: { lat: 57.48, lng: -4.22 },
    KA: { lat: 55.46, lng: -4.63 },
    KT: { lat: 51.38, lng: -0.31 },
    KW: { lat: 58.44, lng: -3.09 },
    KY: { lat: 56.2, lng: -3.15 },
    L: { lat: 53.41, lng: -2.98 },
    LA: { lat: 54.05, lng: -2.8 },
    LD: { lat: 52.24, lng: -3.38 },
    LE: { lat: 52.63, lng: -1.13 },
    LL: { lat: 53.22, lng: -3.83 },
    LN: { lat: 53.23, lng: -0.54 },
    LS: { lat: 53.8, lng: -1.55 },
    LU: { lat: 51.88, lng: -0.42 },
    M: { lat: 53.48, lng: -2.24 },
    ME: { lat: 51.39, lng: 0.54 },
    MK: { lat: 52.04, lng: -0.76 },
    ML: { lat: 55.77, lng: -3.99 },
    N: { lat: 51.57, lng: -0.1 },
    NE: { lat: 54.97, lng: -1.61 },
    NG: { lat: 52.95, lng: -1.15 },
    NN: { lat: 52.24, lng: -0.9 },
    NP: { lat: 51.59, lng: -2.99 },
    NR: { lat: 52.63, lng: 1.3 },
    NW: { lat: 51.55, lng: -0.17 },
    OL: { lat: 53.54, lng: -2.12 },
    OX: { lat: 51.75, lng: -1.26 },
    PA: { lat: 55.84, lng: -4.43 },
    PE: { lat: 52.57, lng: -0.24 },
    PH: { lat: 56.4, lng: -3.43 },
    PL: { lat: 50.37, lng: -4.14 },
    PO: { lat: 50.8, lng: -1.09 },
    PR: { lat: 53.76, lng: -2.7 },
    RG: { lat: 51.45, lng: -0.97 },
    RH: { lat: 51.17, lng: -0.16 },
    RM: { lat: 51.57, lng: 0.18 },
    S: { lat: 53.38, lng: -1.47 },
    SA: { lat: 51.62, lng: -3.94 },
    SE: { lat: 51.47, lng: -0.02 },
    SG: { lat: 51.9, lng: -0.2 },
    SK: { lat: 53.39, lng: -2.16 },
    SL: { lat: 51.51, lng: -0.59 },
    SM: { lat: 51.37, lng: -0.17 },
    SN: { lat: 51.56, lng: -1.78 },
    SO: { lat: 50.91, lng: -1.4 },
    SP: { lat: 51.07, lng: -1.8 },
    SR: { lat: 54.91, lng: -1.38 },
    SS: { lat: 51.54, lng: 0.71 },
    ST: { lat: 53.0, lng: -2.18 },
    SW: { lat: 51.46, lng: -0.17 },
    SY: { lat: 52.71, lng: -2.75 },
    TA: { lat: 51.02, lng: -3.1 },
    TD: { lat: 55.6, lng: -2.43 },
    TF: { lat: 52.68, lng: -2.49 },
    TN: { lat: 51.13, lng: 0.26 },
    TQ: { lat: 50.46, lng: -3.6 },
    TR: { lat: 50.26, lng: -5.05 },
    TS: { lat: 54.57, lng: -1.23 },
    TW: { lat: 51.45, lng: -0.34 },
    UB: { lat: 51.53, lng: -0.42 },
    W: { lat: 51.52, lng: -0.18 },
    WA: { lat: 53.39, lng: -2.59 },
    WC: { lat: 51.52, lng: -0.12 },
    WD: { lat: 51.66, lng: -0.39 },
    WF: { lat: 53.68, lng: -1.49 },
    WN: { lat: 53.55, lng: -2.63 },
    WR: { lat: 52.19, lng: -2.22 },
    WS: { lat: 52.58, lng: -1.97 },
    WV: { lat: 52.59, lng: -2.13 },
    YO: { lat: 53.96, lng: -1.08 },
  };

  const twoLetter = REGION_COORDS[area];
  if (twoLetter) return twoLetter;

  const oneLetter = REGION_COORDS[area[0]!];
  if (oneLetter) return oneLetter;

  return { lat: 52.5, lng: -1.5 };
}
