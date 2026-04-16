/**
 * Function 2: Cost Impact Engine.
 *
 * Hour-by-hour simulation overlaying the user's consumption profile
 * against solar generation + battery storage to calculate net grid
 * reliance and financial savings.
 *
 * Pure function — no I/O, fully deterministic.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface TariffRates {
  /** Flat rate in pence per kWh (÷100 from DB storage). */
  flatRatePence: number;
  /** Standing charge in pence per day (÷100 from DB). */
  standingChargePence: number;
  /** SEG export rate in pence per kWh (÷100 from DB). */
  segExportRatePence: number;
}

export interface CostImpactInput {
  /** 24-element array: hourly solar generation in kWh. */
  solarCurve: number[];
  /** 24-element array: hourly consumption in kWh. */
  loadCurve: number[];
  /** Battery capacity in kWh (0 if no battery). */
  batteryCapacityKwh: number;
  /** Current tariff rates. */
  tariff: TariffRates;
}

export interface ScenarioResult {
  dailyCostPence: number;
  annualCostPounds: number;
  gridImportKwh: number;
  gridExportKwh: number;
  exportRevenuePence: number;
  selfConsumedKwh: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
}

export interface CostImpactResult {
  withoutSolar: ScenarioResult;
  withSolarOnly: ScenarioResult;
  withSolarAndBattery: ScenarioResult;
  dailySavingsPence: number;
  annualSavingsPounds: number;
  selfSufficiencyPercent: number;
}

// ── Engine ───────────────────────────────────────────────────────────

export function calculateCostImpact(input: CostImpactInput): CostImpactResult {
  const { solarCurve, loadCurve, batteryCapacityKwh, tariff } = input;

  const withoutSolar = simulateScenario(loadCurve, new Array(24).fill(0) as number[], 0, tariff);
  const withSolarOnly = simulateScenario(loadCurve, solarCurve, 0, tariff);
  const withSolarAndBattery = simulateScenario(loadCurve, solarCurve, batteryCapacityKwh, tariff);

  const dailySavingsPence = withoutSolar.dailyCostPence - withSolarAndBattery.dailyCostPence;
  const annualSavingsPounds = Math.round((dailySavingsPence * 365) / 100);

  // Self-sufficiency: % of demand met without grid import
  const totalDemand = loadCurve.reduce((s, v) => s + v, 0);
  const selfSufficiencyPercent =
    totalDemand > 0
      ? Math.round(((totalDemand - withSolarAndBattery.gridImportKwh) / totalDemand) * 100)
      : 0;

  return {
    withoutSolar,
    withSolarOnly,
    withSolarAndBattery,
    dailySavingsPence,
    annualSavingsPounds,
    selfSufficiencyPercent,
  };
}

function simulateScenario(
  loadCurve: number[],
  solarCurve: number[],
  batteryCapacity: number,
  tariff: TariffRates,
): ScenarioResult {
  let batteryLevel = 0; // Current battery charge in kWh
  let gridImportKwh = 0;
  let gridExportKwh = 0;
  let selfConsumedKwh = 0;
  let batteryChargeKwh = 0;
  let batteryDischargeKwh = 0;
  let gridCostPence = 0;
  let exportRevenuePence = 0;

  for (let h = 0; h < 24; h++) {
    const demand = loadCurve[h] ?? 0;
    const generation = solarCurve[h] ?? 0;
    let netDemand = demand - generation;

    if (netDemand < 0) {
      // Excess solar — self-consume the demand portion
      selfConsumedKwh += demand;
      const excess = -netDemand;

      // Charge battery with excess
      const chargeRoom = batteryCapacity - batteryLevel;
      const toCharge = Math.min(excess, chargeRoom);
      batteryLevel += toCharge;
      batteryChargeKwh += toCharge;

      // Export remainder to grid
      const toExport = excess - toCharge;
      gridExportKwh += toExport;
      exportRevenuePence += toExport * tariff.segExportRatePence;
    } else {
      // Deficit — solar covers some, rest from battery then grid
      selfConsumedKwh += generation;

      // Discharge battery
      const fromBattery = Math.min(netDemand, batteryLevel);
      batteryLevel -= fromBattery;
      batteryDischargeKwh += fromBattery;
      netDemand -= fromBattery;

      // Buy remainder from grid
      gridImportKwh += netDemand;
      gridCostPence += netDemand * tariff.flatRatePence;
    }
  }

  const dailyCostPence = gridCostPence + tariff.standingChargePence - exportRevenuePence;
  const annualCostPounds = Math.round((dailyCostPence * 365) / 100);

  return {
    dailyCostPence: Math.round(dailyCostPence),
    annualCostPounds,
    gridImportKwh: round2(gridImportKwh),
    gridExportKwh: round2(gridExportKwh),
    exportRevenuePence: Math.round(exportRevenuePence),
    selfConsumedKwh: round2(selfConsumedKwh),
    batteryChargeKwh: round2(batteryChargeKwh),
    batteryDischargeKwh: round2(batteryDischargeKwh),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
