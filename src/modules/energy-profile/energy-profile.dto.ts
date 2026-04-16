/**
 * Response DTOs for the energy-profile module.
 *
 * Designed for mobile/web app consumption:
 *   - No backend-internal fields (userId, lmkKey, uprn stripped)
 *   - Display-friendly field names and units
 *   - Consistent ISO 8601 date format throughout
 *   - Flat structures where possible for easy binding
 */

import type {
  PropertyProfile,
  PropertyEpcHistory,
  EnergyProvider,
  EnergyTariff,
  UserLoadProfile,
} from "../../generated/prisma/client";
import type { HardwareExtrapolation } from "./engines/hardware-extrapolation";

// ── Onboarding Status ─────────────────────────────────────���─────────

export interface OnboardingStatusDTO {
  hasProfile: boolean;
  hasLoadProfile: boolean;
  readyForForecasts: boolean;
  /** 0–100 completion percentage for progress indicators. */
  completionPercent: number;
  /** Ordered list of remaining steps the client should prompt for. */
  nextSteps: string[];
  /** Profile ID if one exists (needed for some client-side operations). */
  profileId: string | null;
}

// ── PropertyProfile ─────────────────────────────────────────────────

export interface PropertyProfileDTO {
  id: string;
  address: string;
  postcode: string;
  propertyType: string;
  builtForm: string;
  totalFloorArea: number;
  /** Current EPC energy rating (A–G). */
  energyRating: string | null;
  hardware: HardwareExtrapolation | null;
  userVerified: boolean;
  /** Number of historical EPC certificates available via UPRN. */
  historyCertCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toPropertyProfileDTO(
  p: PropertyProfile,
  historyCertCount?: number,
): PropertyProfileDTO {
  const epcData = p.latestEpcData as Record<string, string> | null;
  return {
    id: p.id,
    address: p.address,
    postcode: p.postcode,
    propertyType: p.propertyType,
    builtForm: p.builtForm,
    totalFloorArea: p.totalFloorArea,
    energyRating: epcData?.["currentEnergyRating"] ?? null,
    hardware: p.hardware as HardwareExtrapolation | null,
    userVerified: p.userVerified,
    historyCertCount: historyCertCount ?? 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// ── PropertyEpcHistory ────────────────────────────────────────���─────

export interface EpcHistoryDTO {
  id: string;
  inspectionDate: string;
  lodgementDate: string;
  mainheatDescription: string | null;
  photoSupply: string | null;
  spaceHeatingDemand: number | null;
  energyConsumptionCurrent: number | null;
  /** Human-readable summary for display in timeline UI. */
  summary: string;
}

export function toEpcHistoryDTO(h: PropertyEpcHistory): EpcHistoryDTO {
  // Build a short human-readable summary for the mobile timeline
  const parts: string[] = [];
  if (h.mainheatDescription) parts.push(`Heat: ${h.mainheatDescription}`);
  if (h.photoSupply && parseFloat(h.photoSupply) > 0) parts.push("Solar detected");
  if (h.energyConsumptionCurrent) parts.push(`${h.energyConsumptionCurrent} kWh/m\u00B2`);
  const summary = parts.length > 0 ? parts.join(" \u00B7 ") : "No notable changes";

  return {
    id: h.id,
    inspectionDate: h.inspectionDate.toISOString().slice(0, 10),
    lodgementDate: h.lodgementDate.toISOString().slice(0, 10),
    mainheatDescription: h.mainheatDescription,
    photoSupply: h.photoSupply,
    spaceHeatingDemand: h.spaceHeatingDemand,
    energyConsumptionCurrent: h.energyConsumptionCurrent,
    summary,
  };
}

// ── EnergyProvider ──────────────────────────────────────────────────

export interface EnergyProviderDTO {
  id: string;
  name: string;
  slug: string;
  /** Number of tariffs available for this provider. */
  tariffCount?: number | undefined;
}

export function toProviderDTO(
  p: EnergyProvider & { _count?: { tariffs: number } | undefined },
): EnergyProviderDTO {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    tariffCount: p._count?.tariffs,
  };
}

// ── EnergyTariff ────────────────────────────────────────────────────

export interface EnergyTariffDTO {
  id: string;
  providerId: string;
  providerName?: string | undefined;
  name: string;
  tariffType: string;
  /** Display-friendly rate: "24.50p/kWh" */
  displayRate: string;
  flatRatePence: number | null;
  peakRatePence: number | null;
  offPeakRatePence: number | null;
  peakStartHour: number | null;
  peakEndHour: number | null;
  standingChargePence: number;
  segExportRatePence: number | null;
  isDefault: boolean;
  validFrom: string;
  validTo: string | null;
  source: string;
}

export function toTariffDTO(t: EnergyTariff & { provider?: EnergyProvider }): EnergyTariffDTO {
  // Build display-friendly rate string
  const rate = t.flatRatePence ?? t.peakRatePence ?? 0;
  const displayRate = rate > 0 ? `${(rate / 100).toFixed(2)}p/kWh` : "Variable";

  return {
    id: t.id,
    providerId: t.providerId,
    providerName: t.provider?.name,
    name: t.name,
    tariffType: t.tariffType,
    displayRate,
    flatRatePence: t.flatRatePence,
    peakRatePence: t.peakRatePence,
    offPeakRatePence: t.offPeakRatePence,
    peakStartHour: t.peakStartHour,
    peakEndHour: t.peakEndHour,
    standingChargePence: t.standingChargePence,
    segExportRatePence: t.segExportRatePence,
    isDefault: t.isDefault,
    validFrom: t.validFrom.toISOString().slice(0, 10),
    validTo: t.validTo?.toISOString().slice(0, 10) ?? null,
    source: t.source,
  };
}

// ── UserLoadProfile ─────────────────────────────────────────────────

export interface UserLoadProfileDTO {
  id: string;
  providerId: string;
  providerName: string;
  tariffId: string;
  tariffName: string;
  /** Display-friendly: "British Gas — Standard Variable Tariff" */
  displayTariff: string;
  monthlyBillPence: number;
  /** Display-friendly: "£150.00/month" */
  displayBill: string;
  dailyKwh: number;
  hourlyDistribution: number[];
  createdAt: string;
  updatedAt: string;
}

export function toLoadProfileDTO(
  l: UserLoadProfile,
  providerName: string,
  tariffName: string,
): UserLoadProfileDTO {
  return {
    id: l.id,
    providerId: l.providerId,
    providerName,
    tariffId: l.tariffId,
    tariffName,
    displayTariff: `${providerName} \u2014 ${tariffName}`,
    monthlyBillPence: l.monthlyBillPence,
    displayBill: `\u00a3${(l.monthlyBillPence / 100).toFixed(2)}/month`,
    dailyKwh: l.dailyKwh,
    hourlyDistribution: l.hourlyDistribution as number[],
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

// ── Dashboard Bundle ────────────────────────────────────────────────

export interface DashboardDTO {
  status: OnboardingStatusDTO;
  profile: PropertyProfileDTO | null;
  loadProfile: UserLoadProfileDTO | null;
  forecasts: ForecastSummaryDTO | null;
}

// ── Forecast Summary (with error reasons) ───────────────────────────

import type { SolarForecastResult } from "./engines/solar-forecast.engine";
import type { CostImpactResult } from "./engines/cost-impact.engine";
import type { TariffCheckerResult } from "./engines/tariff-checker.engine";
import type { HeatPumpResult } from "./engines/heat-pump.engine";

export interface ForecastSummaryDTO {
  solar: SolarForecastResult | null;
  costImpact: CostImpactResult | null;
  tariffComparison: TariffCheckerResult | null;
  heatPump: HeatPumpResult | null;
  /** Per-forecast error reason when null — tells client WHY it failed. */
  errors: {
    solar: string | null;
    costImpact: string | null;
    tariffComparison: string | null;
    heatPump: string | null;
  };
}
