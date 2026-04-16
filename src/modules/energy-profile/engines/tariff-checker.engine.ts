/**
 * Function 3: Tariff Checker Engine — SVT vs Time-of-Use comparison.
 *
 * Takes the net-grid profile (after solar + battery) and prices it
 * under a flat SVT tariff vs a smart ToU tariff, including overnight
 * battery charging optimisation for the ToU scenario.
 *
 * Pure function — no I/O.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface TouRates {
  /** Off-peak rate pence/kWh (e.g. overnight). */
  offPeakRatePence: number;
  /** Standard rate pence/kWh. */
  standardRatePence: number;
  /** Peak rate pence/kWh. */
  peakRatePence: number;
  /** Off-peak window: start hour (inclusive). */
  offPeakStartHour: number;
  /** Off-peak window: end hour (exclusive). */
  offPeakEndHour: number;
  /** Peak window: start hour (inclusive). */
  peakStartHour: number;
  /** Peak window: end hour (exclusive). */
  peakEndHour: number;
  /** Standing charge pence/day. */
  standingChargePence: number;
}

export interface TariffCheckerInput {
  /** 24-element array: hourly net grid demand in kWh (positive = import, negative = export). */
  loadCurve: number[];
  /** 24-element array: hourly solar generation in kWh. */
  solarCurve: number[];
  /** Battery capacity in kWh. */
  batteryCapacityKwh: number;
  /** SVT flat rate in pence/kWh. */
  svtRatePence: number;
  /** SVT standing charge pence/day. */
  svtStandingChargePence: number;
  /** SEG export rate pence/kWh. */
  segExportRatePence: number;
  /** Time-of-use tariff rates. */
  touRates: TouRates;
}

export interface TariffScenario {
  tariffName: string;
  dailyCostPence: number;
  annualCostPounds: number;
  gridImportKwh: number;
  gridExportKwh: number;
  /** kWh charged into battery from grid overnight (ToU only). */
  overnightChargeKwh: number;
}

export interface TariffCheckerResult {
  svt: TariffScenario;
  tou: TariffScenario;
  recommendation: "svt" | "tou";
  annualSavingPounds: number;
  explanation: string;
}

// ── Default UK ToU rates ────────────────────────────────────────────

/** Sensible UK ToU defaults (Octopus Go-like). */
export const DEFAULT_TOU_RATES: TouRates = {
  offPeakRatePence: 700, // 7p overnight
  standardRatePence: 2450, // 24.5p standard
  peakRatePence: 3500, // 35p peak
  offPeakStartHour: 0, // midnight
  offPeakEndHour: 5, // 5am
  peakStartHour: 16, // 4pm
  peakEndHour: 19, // 7pm
  standingChargePence: 6138, // ~61p
};

// ── Engine ───────────────────────────────────────────────────────────

export function compareTariffs(input: TariffCheckerInput): TariffCheckerResult {
  const svt = simulateSvt(input);
  const tou = simulateTou(input);

  const annualSavingPounds = svt.annualCostPounds - tou.annualCostPounds;
  const recommendation = annualSavingPounds > 0 ? "tou" : "svt";

  const explanation =
    recommendation === "tou"
      ? `Switching to a Time-of-Use tariff could save ~\u00a3${Math.abs(annualSavingPounds)} per year ` +
        `by charging your battery overnight at ${input.touRates.offPeakRatePence.toFixed(1)}p/kWh ` +
        `instead of buying at peak rates.`
      : `Your current Standard Variable Tariff is more cost-effective. ` +
        `A Time-of-Use tariff would cost ~\u00a3${Math.abs(annualSavingPounds)} more per year ` +
        `because your peak-hour consumption is too high relative to off-peak savings.`;

  return {
    svt,
    tou,
    recommendation,
    annualSavingPounds: Math.abs(annualSavingPounds),
    explanation,
  };
}

function simulateSvt(input: TariffCheckerInput): TariffScenario {
  const {
    loadCurve,
    solarCurve,
    batteryCapacityKwh,
    svtRatePence,
    svtStandingChargePence,
    segExportRatePence,
  } = input;

  let batteryLevel = 0;
  let gridImportKwh = 0;
  let gridExportKwh = 0;
  let costPence = 0;

  for (let h = 0; h < 24; h++) {
    const demand = loadCurve[h] ?? 0;
    const solar = solarCurve[h] ?? 0;
    let net = demand - solar;

    if (net < 0) {
      const excess = -net;
      const toCharge = Math.min(excess, batteryCapacityKwh - batteryLevel);
      batteryLevel += toCharge;
      const toExport = excess - toCharge;
      gridExportKwh += toExport;
      costPence -= toExport * segExportRatePence;
    } else {
      const fromBattery = Math.min(net, batteryLevel);
      batteryLevel -= fromBattery;
      net -= fromBattery;
      gridImportKwh += net;
      costPence += net * svtRatePence;
    }
  }

  const dailyCostPence = Math.round(costPence + svtStandingChargePence);
  return {
    tariffName: "Standard Variable Tariff",
    dailyCostPence,
    annualCostPounds: Math.round((dailyCostPence * 365) / 100),
    gridImportKwh: round2(gridImportKwh),
    gridExportKwh: round2(gridExportKwh),
    overnightChargeKwh: 0,
  };
}

function simulateTou(input: TariffCheckerInput): TariffScenario {
  const { loadCurve, solarCurve, batteryCapacityKwh, segExportRatePence, touRates } = input;

  let batteryLevel = 0;
  let gridImportKwh = 0;
  let gridExportKwh = 0;
  let costPence = 0;
  let overnightChargeKwh = 0;

  for (let h = 0; h < 24; h++) {
    const demand = loadCurve[h] ?? 0;
    const solar = solarCurve[h] ?? 0;
    const isOffPeak = h >= touRates.offPeakStartHour && h < touRates.offPeakEndHour;
    const isPeak = h >= touRates.peakStartHour && h < touRates.peakEndHour;
    const rate = isOffPeak
      ? touRates.offPeakRatePence
      : isPeak
        ? touRates.peakRatePence
        : touRates.standardRatePence;

    let net = demand - solar;

    // During off-peak: charge battery from grid if solar didn't fill it
    if (isOffPeak && batteryLevel < batteryCapacityKwh) {
      const toCharge = batteryCapacityKwh - batteryLevel;
      batteryLevel = batteryCapacityKwh;
      overnightChargeKwh += toCharge;
      gridImportKwh += toCharge;
      costPence += toCharge * rate;
    }

    if (net < 0) {
      const excess = -net;
      const toCharge = Math.min(excess, batteryCapacityKwh - batteryLevel);
      batteryLevel += toCharge;
      const toExport = excess - toCharge;
      gridExportKwh += toExport;
      costPence -= toExport * segExportRatePence;
    } else {
      // During peak hours, prioritise battery discharge
      const fromBattery = Math.min(net, batteryLevel);
      batteryLevel -= fromBattery;
      net -= fromBattery;
      gridImportKwh += net;
      costPence += net * rate;
    }
  }

  const dailyCostPence = Math.round(costPence + touRates.standingChargePence);
  return {
    tariffName: "Time-of-Use (Smart)",
    dailyCostPence,
    annualCostPounds: Math.round((dailyCostPence * 365) / 100),
    gridImportKwh: round2(gridImportKwh),
    gridExportKwh: round2(gridExportKwh),
    overnightChargeKwh: round2(overnightChargeKwh),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
