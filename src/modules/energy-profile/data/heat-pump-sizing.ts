/**
 * Heat Pump Sizing Rules — derives required capacity from property floor area
 * and building efficiency (age/insulation quality).
 *
 * Sizing logic based on UK heat pump installer guidelines (2024).
 *
 * Key principle: Older properties with poor insulation need ~25% larger units
 * to maintain comfort and efficiency.
 */

export interface HeatPumpSize {
  /** Property floor area in square meters */
  floorAreaSqm: number;
  /** Base capacity from floor area (kW) */
  baseCapacityKw: number;
  /** Efficiency multiplier (1.0 = modern, 1.25 = old/poor insulation) */
  efficiencyMultiplier: number;
  /** Final recommended capacity (kW) */
  recommendedCapacityKw: number;
  /** Reason for sizing (for display to user) */
  reason: string;
}

/**
 * Standard heat pump sizes available in UK market (kW).
 */
const STANDARD_HP_SIZES = [4, 5, 6, 8, 10, 12, 15];

/**
 * Size a heat pump based on floor area and building efficiency.
 *
 * Rules:
 * - ≤100 sqm: 4–5 kW
 * - 100–200 sqm: 6–8 kW
 * - >200 sqm: 10–12 kW
 *
 * Multiplier adjustment:
 * - Modern (energyConsumption <120 kWh/m²/year): 1.0× (efficient)
 * - Standard (120–150 kWh/m²/year): 1.1× (minor upgrade needed)
 * - Poor (>150 kWh/m²/year): 1.25× (poor insulation, needs larger unit)
 *
 * @param floorAreaSqm - Property floor area in square meters
 * @param energyConsumptionKwhPerSqmYear - EPC energy consumption (already in kWh/m²/year)
 * @returns Recommended heat pump capacity (rounded to nearest standard size)
 */
export function heatPumpSize(
  floorAreaSqm: number,
  energyConsumptionKwhPerSqmYear: number | null,
): HeatPumpSize {
  // Base capacity from floor area (typical: 50-60W per sqm)
  const baseCapacityKw = getBaseCapacity(floorAreaSqm);

  // Efficiency multiplier based on building quality
  const { multiplier, efficiencyRating } = getEfficiencyMultiplier(energyConsumptionKwhPerSqmYear);

  // Unadjusted required capacity
  const requiredCapacityKw = baseCapacityKw * multiplier;

  // Round up to nearest standard size
  const recommendedCapacityKw = roundToStandardSize(requiredCapacityKw);

  const reason = buildReasonString(floorAreaSqm, efficiencyRating, multiplier);

  return {
    floorAreaSqm,
    baseCapacityKw,
    efficiencyMultiplier: multiplier,
    recommendedCapacityKw,
    reason,
  };
}

/**
 * Base heat pump capacity from floor area.
 * Assumes ~50-60W per sqm for modern construction.
 */
function getBaseCapacity(floorAreaSqm: number): number {
  if (floorAreaSqm <= 100) {
    return 4.5;
  }
  if (floorAreaSqm <= 200) {
    return 7.0;
  }
  return 11.0;
}

/**
 * Efficiency multiplier based on building energy consumption.
 * Older/poorly insulated properties need larger units.
 */
function getEfficiencyMultiplier(energyConsumptionKwhPerSqmYear: number | null): {
  multiplier: number;
  efficiencyRating: string;
} {
  if (energyConsumptionKwhPerSqmYear === null || energyConsumptionKwhPerSqmYear === undefined) {
    // Unknown efficiency — assume average (no multiplier)
    return { multiplier: 1.0, efficiencyRating: "unknown" };
  }

  if (energyConsumptionKwhPerSqmYear < 120) {
    // Modern, well-insulated property (EPC A-B equivalent)
    return { multiplier: 1.0, efficiencyRating: "modern" };
  }

  if (energyConsumptionKwhPerSqmYear <= 150) {
    // Standard property, minor upgrades may help (EPC C-D equivalent)
    return { multiplier: 1.1, efficiencyRating: "standard" };
  }

  // Poor insulation, significant thermal losses (EPC E-G equivalent)
  // Older property or poor thermal envelope → needs larger unit
  return { multiplier: 1.25, efficiencyRating: "poor" };
}

/**
 * Round capacity up to nearest standard size.
 */
function roundToStandardSize(capacityKw: number): number {
  for (const size of STANDARD_HP_SIZES) {
    if (capacityKw <= size) return size;
  }
  return STANDARD_HP_SIZES[STANDARD_HP_SIZES.length - 1]!;
}

/**
 * Build human-readable reason string for sizing.
 */
function buildReasonString(
  floorAreaSqm: number,
  efficiencyRating: string,
  multiplier: number,
): string {
  const sizeCategory = floorAreaSqm <= 100 ? "small" : floorAreaSqm <= 200 ? "medium" : "large";

  const efficiencyNote =
    multiplier === 1.0
      ? "(modern, efficient property)"
      : multiplier === 1.1
        ? "(standard insulation, +10% capacity)"
        : "(poor insulation, +25% capacity)";

  return `${sizeCategory.charAt(0).toUpperCase() + sizeCategory.slice(1)} property, ${efficiencyRating} efficiency ${efficiencyNote}`;
}
