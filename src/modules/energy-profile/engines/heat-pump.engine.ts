/**
 * Function 4: Heat Pump Running Cost Simulation.
 *
 * Converts fossil fuel (gas) space heating demand into electrical demand
 * via a heat pump COP, distributes the new electrical load across
 * heating hours, and re-runs the tariff checker to show the combined
 * impact of solar + battery + heat pump.
 *
 * Pure function — no I/O.
 */

import { compareTariffs, type TariffCheckerResult, type TouRates } from "./tariff-checker.engine";

// ── Types ───────────────────────────────────────────────────────────

export interface HeatPumpInput {
  /** Annual space heating demand in kWh (from EPC or derived). */
  annualSpaceHeatingDemandKwh: number;
  /** Heat pump Coefficient of Performance (default 3.0). */
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
}

export interface HeatPumpResult {
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
  const cop = input.cop ?? 3.0;
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
  const annualRunningCostPounds = bestTariff.annualCostPounds;

  return {
    annualElectricalDemandKwh: Math.round(annualElectricalDemandKwh),
    dailyHeatPumpKwh: round2(dailyHeatPumpKwh),
    cop,
    heatPumpLoadCurve,
    combinedLoadCurve,
    tariffComparison,
    solarAbsorptionPercent,
    annualRunningCostPounds,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
