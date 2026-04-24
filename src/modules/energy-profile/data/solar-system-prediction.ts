/**
 * Solar System Prediction — estimates actual installed capacity based on
 * installation year, accounting for historical panel wattages, inverter sizing,
 * and battery adoption rates.
 *
 * When solar is DETECTED in EPC, we predict what was actually installed in that era,
 * rather than assuming the theoretical maximum for the property type.
 *
 * Source: UK solar installer data (2010–2024) and industry trends.
 */

export interface PanelEraData {
  year: number;
  wattagePerPanel: number;
  technology: string;
}

export interface SolarSystemPrediction {
  /** Year system was installed */
  installationYear: number;
  /** Panel wattage in that era */
  panelWattage: number;
  /** Panel technology in that era */
  panelTechnology: string;
  /** Predicted panel count for era (typical system size) */
  estimatedPanelCount: number;
  /** Predicted capacity in kWp */
  estimatedCapacityKwp: number;
  /** Predicted inverter size */
  inverterKw: number;
  /** Predicted battery (0 if unlikely for that era) */
  batteryKwh: number;
  /** Confidence in prediction ("high" = birth date found, "medium" = estimated) */
  confidence: "high" | "medium";
  /** Age degradation applied (typical 0.6%/year) */
  degradationPercent: number;
  /** Effective capacity after aging */
  effectiveCapacityKwp: number;
  /** Reason for prediction */
  reason: string;
}

/**
 * Historical panel wattages by era.
 * Source: UK installer data, solar efficiency improvements over time.
 */
const PANEL_ERA_DATA: PanelEraData[] = [
  { year: 2010, wattagePerPanel: 240, technology: "Multi-Si (older)" },
  { year: 2011, wattagePerPanel: 245, technology: "Multi-Si" },
  { year: 2012, wattagePerPanel: 250, technology: "Multi-Si" },
  { year: 2013, wattagePerPanel: 260, technology: "Multi-Si" },
  { year: 2014, wattagePerPanel: 270, technology: "Multi-Si" },
  { year: 2015, wattagePerPanel: 340, technology: "Multi-Si (improved)" },
  { year: 2016, wattagePerPanel: 350, technology: "Multi-Si" },
  { year: 2017, wattagePerPanel: 360, technology: "Multi-Si" },
  { year: 2018, wattagePerPanel: 370, technology: "Multi-Si" },
  { year: 2019, wattagePerPanel: 390, technology: "Multi-Si (premium)" },
  { year: 2020, wattagePerPanel: 400, technology: "Mono-Si (bifacial)" },
  { year: 2021, wattagePerPanel: 410, technology: "Mono-Si (improved)" },
  { year: 2022, wattagePerPanel: 420, technology: "Mono-Si (premium)" },
  { year: 2023, wattagePerPanel: 430, technology: "N-Type Si" },
  { year: 2024, wattagePerPanel: 435, technology: "N-Type Si (current)" },
];

/**
 * Typical system sizes by era (in kWp).
 * UK market preferred: residential 3–6kWp for space & cost constraints.
 */
const TYPICAL_SYSTEM_SIZE_BY_ERA: Record<
  string,
  { minKwp: number; maxKwp: number; avgKwp: number }
> = {
  "2010-2014": { minKwp: 2.5, maxKwp: 3.5, avgKwp: 3.0 },
  "2015-2019": { minKwp: 3.5, maxKwp: 5.0, avgKwp: 4.2 },
  "2020-2022": { minKwp: 4.0, maxKwp: 5.5, avgKwp: 4.8 },
  "2023+": { minKwp: 5.0, maxKwp: 6.5, avgKwp: 5.5 },
};

/**
 * Battery adoption rate by year (% of systems with battery).
 * Batteries were rare before 2020, now common.
 */
const BATTERY_ADOPTION_BY_YEAR: Record<
  number,
  { adoptionPercent: number; typicalCapacityKwh: number }
> = {
  2015: { adoptionPercent: 0, typicalCapacityKwh: 0 },
  2016: { adoptionPercent: 0, typicalCapacityKwh: 0 },
  2017: { adoptionPercent: 1, typicalCapacityKwh: 5 },
  2018: { adoptionPercent: 2, typicalCapacityKwh: 5 },
  2019: { adoptionPercent: 3, typicalCapacityKwh: 5 },
  2020: { adoptionPercent: 8, typicalCapacityKwh: 5 },
  2021: { adoptionPercent: 15, typicalCapacityKwh: 10 },
  2022: { adoptionPercent: 25, typicalCapacityKwh: 10 },
  2023: { adoptionPercent: 40, typicalCapacityKwh: 10 },
  2024: { adoptionPercent: 50, typicalCapacityKwh: 10 },
};

/**
 * Get panel wattage for a given year (linear interpolation if year between data points).
 */
function getPanelWattageForYear(year: number): PanelEraData {
  const current = new Date().getFullYear();
  const targetYear = Math.min(Math.max(year, 2010), current);

  // Find exact or closest match
  for (let i = PANEL_ERA_DATA.length - 1; i >= 0; i--) {
    if (PANEL_ERA_DATA[i]!.year <= targetYear) {
      return PANEL_ERA_DATA[i]!;
    }
  }

  return PANEL_ERA_DATA[0]!;
}

/**
 * Get typical system size range for an era.
 */
function getTypicalSystemSize(year: number): { minKwp: number; maxKwp: number; avgKwp: number } {
  if (year <= 2014) return TYPICAL_SYSTEM_SIZE_BY_ERA["2010-2014"]!;
  if (year <= 2019) return TYPICAL_SYSTEM_SIZE_BY_ERA["2015-2019"]!;
  if (year <= 2022) return TYPICAL_SYSTEM_SIZE_BY_ERA["2020-2022"]!;
  return TYPICAL_SYSTEM_SIZE_BY_ERA["2023+"]!;
}

/**
 * Get battery adoption for a year (percent chance system has battery).
 */
function getBatteryAdoption(year: number): { adoptionPercent: number; typicalCapacityKwh: number } {
  const adoptionData = BATTERY_ADOPTION_BY_YEAR[year];
  if (adoptionData) return adoptionData;

  // Extrapolate if year beyond data
  const current = new Date().getFullYear();
  if (year < 2015) return { adoptionPercent: 0, typicalCapacityKwh: 0 };
  if (year > current)
    return BATTERY_ADOPTION_BY_YEAR[current] ?? { adoptionPercent: 50, typicalCapacityKwh: 10 };

  // Linear interpolation between years
  const keys = Object.keys(BATTERY_ADOPTION_BY_YEAR)
    .map(Number)
    .sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i]! < year && year < keys[i + 1]!) {
      const prev = BATTERY_ADOPTION_BY_YEAR[keys[i]!]!;
      const next = BATTERY_ADOPTION_BY_YEAR[keys[i + 1]!]!;
      const ratio = (year - keys[i]!) / (keys[i + 1]! - keys[i]!);
      return {
        adoptionPercent:
          prev.adoptionPercent + (next.adoptionPercent - prev.adoptionPercent) * ratio,
        typicalCapacityKwh:
          prev.typicalCapacityKwh + (next.typicalCapacityKwh - prev.typicalCapacityKwh) * ratio,
      };
    }
  }

  return { adoptionPercent: 0, typicalCapacityKwh: 0 };
}

/**
 * Calculate panel degradation based on age.
 * Typical degradation: 0.6% per year (0.5–0.8% range).
 * After 10 years: ~6% loss, after 20 years: ~12% loss.
 */
function calculateDegradation(ageYears: number): number {
  const ANNUAL_DEGRADATION = 0.006; // 0.6% per year
  return Math.round(ageYears * ANNUAL_DEGRADATION * 1000) / 10; // Return as percentage
}

/**
 * Predict actual solar system based on installation year.
 *
 * @param installationYear - Year the system was installed (from EPC birth date)
 * @param confidence - "high" if birth date was explicit, "medium" if estimated
 * @returns Predicted system specs (capacity, inverter, battery)
 */
export function predictSolarSystem(
  installationYear: number,
  confidence: "high" | "medium" = "high",
): SolarSystemPrediction {
  const now = new Date().getFullYear();
  const ageYears = Math.max(0, now - installationYear);

  // Get panel wattage from the installation year
  const panelEra = getPanelWattageForYear(installationYear);

  // Get typical system size for that era
  const typicalSize = getTypicalSystemSize(installationYear);

  // Estimate panel count from average capacity and panel wattage
  const estimatedCapacityKwp = typicalSize.avgKwp;
  const estimatedPanelCount = Math.round((estimatedCapacityKwp * 1000) / panelEra.wattagePerPanel);

  // Inverter sizing: match to capacity (rounded to standard sizes)
  const inverterKw = selectInverterSize(estimatedCapacityKwp);

  // Battery adoption: was this likely to have a battery?
  const batteryData = getBatteryAdoption(installationYear);
  // Use adoption percentage as confidence indicator
  const likelyHasBattery = batteryData.adoptionPercent > 10; // >10% adoption = plausible
  const batteryKwh = likelyHasBattery ? batteryData.typicalCapacityKwh : 0;

  // Calculate degradation
  const degradationPercent = calculateDegradation(ageYears);
  const effectiveCapacityKwp = estimatedCapacityKwp * (1 - degradationPercent / 100);

  const reason =
    `System installed in ${installationYear} (${ageYears} years old). ` +
    `Typical era: ${estimatedPanelCount} panels × ${panelEra.wattagePerPanel}W = ${estimatedCapacityKwp}kWp. ` +
    `Degradation: ${degradationPercent.toFixed(1)}% (${effectiveCapacityKwp.toFixed(2)}kWp effective). ` +
    `Battery: ${likelyHasBattery ? `${batteryKwh}kWh (${batteryData.adoptionPercent.toFixed(0)}% adoption in ${installationYear})` : "Unlikely (pre-2020)"}`;

  return {
    installationYear,
    panelWattage: panelEra.wattagePerPanel,
    panelTechnology: panelEra.technology,
    estimatedPanelCount,
    estimatedCapacityKwp,
    inverterKw,
    batteryKwh,
    confidence,
    degradationPercent,
    effectiveCapacityKwp: Math.round(effectiveCapacityKwp * 100) / 100,
    reason,
  };
}

/**
 * Select standard inverter size based on capacity.
 */
function selectInverterSize(capacityKwp: number): number {
  if (capacityKwp <= 3.0) return 3.6;
  if (capacityKwp <= 5.0) return 5;
  if (capacityKwp <= 7.5) return 8;
  return 10;
}
