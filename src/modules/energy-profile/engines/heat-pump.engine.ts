/**
 * Function 4: Heat Pump Running Cost Simulation & Boiler Comparison.
 *
 * Converts fossil fuel (gas) space heating demand into:
 *   1. Current gas boiler scenario (baseline with age-dependent efficiency)
 *   2. Heat pump alternative scenario (with COP, solar synergy, ToU optimization)
 *
 * Compares annual heating costs and calculates payback/ROI.
 *
 * Pure function — no I/O, fully deterministic.
 */

import { compareTariffs, type TariffCheckerResult, type TouRates } from "./tariff-checker.engine";
import { getBoilerEfficiency, getHeatPumpCOP, estimateBoilerAge } from "../data/boiler-efficiency";

// ── Types ───────────────────────────────────────────────────────────

export interface HeatPumpInput {
  /** Annual space heating demand in kWh (from EPC or derived). */
  annualSpaceHeatingDemandKwh: number;
  /** Heat pump Coefficient of Performance (optional; derived from boiler age if not provided). */
  cop?: number;
  /** Existing 24h load profile (hourly kWh). */
  loadCurve: number[];
  /** 24h solar generation curve (hourly kWh). */
  solarCurve: number[];
  /** Battery capacity in kWh. */
  batteryCapacityKwh: number;
  /** SVT flat rate pence/kWh. */
  svtRatePence: number;
  /** SVT standing charge pence/day. */
  svtStandingChargePence: number;
  /** SEG export rate pence/kWh. */
  segExportRatePence: number;
  /** ToU rates. */
  touRates: TouRates;
  // Boiler comparison (new)
  /** Gas tariff in pence/kWh (for baseline scenario). */
  gasTariffPence?: number;
  /** Gas standing charge in pence/day (for baseline scenario). */
  gasStandingChargePence?: number;
  /** Main heat description from EPC (to extract boiler age). */
  mainheatDescription?: string;
  /** EPC inspection date (ISO string; used to estimate boiler age if not in description). */
  epcInspectionDate?: string;
}

export interface BoilerScenario {
  /** Gas boiler efficiency (age-dependent). */
  boilerEfficiency: number;
  /** Boiler age in years. */
  boilerAgeYears: number;
  /** Annual gas demand in kWh (spaceHeating / efficiency). */
  annualGasDemandKwh: number;
  /** Daily gas demand in kWh. */
  dailyGasKwh: number;
  /** Annual gas cost (pence). */
  annualGasCostPence: number;
  /** Annual gas cost (pounds). */
  annualGasCostPounds: number;
}

export interface HeatPumpScenario {
  /** Annual electrical demand for heating (spaceHeating / COP). */
  annualElectricalDemandKwh: number;
  /** Daily electrical demand for heating. */
  dailyHeatPumpKwh: number;
  /** COP used in calculation. */
  cop: number;
  /** 24h heat pump load distribution. */
  heatPumpLoadCurve: number[];
  /** Combined load = original + heat pump. */
  combinedLoadCurve: number[];
  /** Tariff comparison with the combined load profile. */
  tariffComparison: TariffCheckerResult;
  /** % of heat pump demand met by solar + battery. */
  solarAbsorptionPercent: number;
  /** Annual running cost with best tariff (pounds). */
  annualRunningCostPounds: number;
}

export interface HeatPumpResult {
  // Current boiler baseline
  boilerScenario: BoilerScenario;
  // Heat pump alternative
  heatPumpScenario: HeatPumpScenario;
  // Comparison metrics
  /** Annual cost difference: HP vs Boiler (negative = HP cheaper). */
  annualCostDeltaPounds: number;
  /** Payback period in years (if installing HP today; -1 if HP is immediately cheaper). */
  paybackYears: number | null;
  /** Annual savings with HP vs current boiler (pounds). */
  annualSavingsPounds: number;
}

// ── Heat pump load distribution ─────────────────────────────────────

/**
 * Standard UK heat pump hourly distribution.
 *
 * Weighted towards morning (6-9am) and evening (16-21) heating periods.
 * Night setback reduces load. Summer fraction is ~30% of winter (DHW only).
 *
 * This is the WINTER profile. Summer is scaled down externally when
 * generating seasonal forecasts.
 */
const HEAT_PUMP_HOURLY_WEIGHTS: readonly number[] = [
  0.02, // 00:00 — night setback
  0.02, // 01:00
  0.02, // 02:00
  0.02, // 03:00
  0.02, // 04:00
  0.03, // 05:00 — pre-heat ramp
  0.08, // 06:00 — morning heating
  0.09, // 07:00
  0.08, // 08:00
  0.05, // 09:00 — occupants leave
  0.03, // 10:00
  0.02, // 11:00
  0.02, // 12:00
  0.02, // 13:00
  0.02, // 14:00
  0.03, // 15:00
  0.07, // 16:00 — evening heating
  0.09, // 17:00
  0.09, // 18:00
  0.08, // 19:00
  0.06, // 20:00
  0.04, // 21:00
  0.03, // 22:00
  0.02, // 23:00
] as const;

// ── Engine ───────────────────────────────────────────────────────────

export function simulateHeatPump(input: HeatPumpInput): HeatPumpResult {
  // ── Boiler Baseline Scenario ──────────────────────────────────────
  const boilerAgeYears = estimateBoilerAge(input.mainheatDescription, input.epcInspectionDate);
  const boilerEff = getBoilerEfficiency(boilerAgeYears);
  const annualGasDemandKwh = input.annualSpaceHeatingDemandKwh / boilerEff.efficiency;
  const dailyGasKwh = annualGasDemandKwh / 365;

  // Calculate annual gas cost (baseline scenario)
  // Cost = (daily demand × rate) + (daily standing charge) × 365 days
  const gasTariffPence = input.gasTariffPence ?? 7.5; // UK average gas ~7.5p/kWh
  const gasStandingChargePence = input.gasStandingChargePence ?? 50; // UK average ~50p/day
  const annualGasCostPence = dailyGasKwh * gasTariffPence * 365 + gasStandingChargePence * 365;
  const annualGasCostPounds = annualGasCostPence / 100;

  const boilerScenario: BoilerScenario = {
    boilerEfficiency: boilerEff.efficiency,
    boilerAgeYears,
    annualGasDemandKwh: Math.round(annualGasDemandKwh),
    dailyGasKwh: round2(dailyGasKwh),
    annualGasCostPence: Math.round(annualGasCostPence),
    annualGasCostPounds: round2(annualGasCostPounds),
  };

  // ── Heat Pump Scenario ────────────────────────────────────────────
  // Use provided COP, or derive from boiler age (assume similar age for current HP if replacing)
  const cop = input.cop ?? getHeatPumpCOP(boilerAgeYears);
  const annualElectricalDemandKwh = input.annualSpaceHeatingDemandKwh / cop;
  const dailyHeatPumpKwh = annualElectricalDemandKwh / 365;

  // Distribute heat pump load across 24 hours
  const weightSum = HEAT_PUMP_HOURLY_WEIGHTS.reduce((s, w) => s + w, 0);
  const heatPumpLoadCurve = HEAT_PUMP_HOURLY_WEIGHTS.map((w) => (dailyHeatPumpKwh * w) / weightSum);

  // Combine with existing load profile
  const combinedLoadCurve = input.loadCurve.map((load, h) => load + (heatPumpLoadCurve[h] ?? 0));

  // Run tariff comparison with combined profile
  const tariffComparison = compareTariffs({
    loadCurve: combinedLoadCurve,
    solarCurve: input.solarCurve,
    batteryCapacityKwh: input.batteryCapacityKwh,
    svtRatePence: input.svtRatePence,
    svtStandingChargePence: input.svtStandingChargePence,
    segExportRatePence: input.segExportRatePence,
    touRates: input.touRates,
  });

  // Calculate solar absorption: how much of the heat pump demand is
  // offset by solar generation during the same hours
  let solarAbsorbedKwh = 0;
  for (let h = 0; h < 24; h++) {
    const hpDemand = heatPumpLoadCurve[h] ?? 0;
    const solarExcess = Math.max(0, (input.solarCurve[h] ?? 0) - (input.loadCurve[h] ?? 0));
    solarAbsorbedKwh += Math.min(hpDemand, solarExcess);
  }
  const solarAbsorptionPercent =
    dailyHeatPumpKwh > 0 ? Math.round((solarAbsorbedKwh / dailyHeatPumpKwh) * 100) : 0;

  // Annual running cost with the better tariff
  const bestTariff =
    tariffComparison.recommendation === "tou" ? tariffComparison.tou : tariffComparison.svt;
  const hpAnnualRunningCostPounds = bestTariff.annualCostPounds;

  const heatPumpScenario: HeatPumpScenario = {
    annualElectricalDemandKwh: Math.round(annualElectricalDemandKwh),
    dailyHeatPumpKwh: round2(dailyHeatPumpKwh),
    cop,
    heatPumpLoadCurve,
    combinedLoadCurve,
    tariffComparison,
    solarAbsorptionPercent,
    annualRunningCostPounds: hpAnnualRunningCostPounds,
  };

  // ── Comparison & Payback ──────────────────────────────────────────
  const annualCostDeltaPounds = hpAnnualRunningCostPounds - annualGasCostPounds;
  const annualSavingsPounds = Math.max(0, -annualCostDeltaPounds);

  // Payback period: assumes typical HP install cost £8000–15000
  // Use £10000 as mid-range estimate. Payback = install cost / annual savings
  const hpInstallCostEstimate = 10000; // £ (typical 8–15 range)
  const paybackYears =
    annualSavingsPounds > 0
      ? Math.round((hpInstallCostEstimate / annualSavingsPounds) * 10) / 10
      : null;

  return {
    boilerScenario,
    heatPumpScenario,
    annualCostDeltaPounds: round2(annualCostDeltaPounds),
    paybackYears,
    annualSavingsPounds: round2(annualSavingsPounds),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
