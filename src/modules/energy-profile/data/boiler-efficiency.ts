/**
 * Gas Boiler Efficiency Model — derives boiler efficiency from age.
 *
 * Boiler efficiency degrades with age due to wear, scale buildup, and
 * combustion drift. Efficiency is critical for cost calculations when
 * comparing gas heating vs heat pump alternatives.
 *
 * Source: UK boiler manufacturer data (2024) and field observations.
 */

export interface BoilerEfficiency {
  /** Age of boiler in years */
  ageYears: number;
  /** Efficiency as decimal (0.85 = 85%) */
  efficiency: number;
  /** Human-readable description */
  description: string;
}

/**
 * Calculate boiler efficiency based on age.
 *
 * Efficiency curve (empirically derived):
 *   <3 years:   98% (newly installed, optimal)
 *   3-5 years:  95% (slight wear)
 *   5-10 years: 90% (moderate wear, scale buildup)
 *   10+ years:  85% (significant wear, combustion drift)
 *
 * @param ageYears - Boiler age in years
 * @returns Efficiency as decimal (0.85 for 85%)
 */
export function getBoilerEfficiency(ageYears: number): BoilerEfficiency {
  let efficiency: number;
  let description: string;

  if (ageYears < 3) {
    efficiency = 0.98;
    description = "Newly installed, optimal efficiency";
  } else if (ageYears < 5) {
    efficiency = 0.95;
    description = "Good condition, slight wear";
  } else if (ageYears < 10) {
    efficiency = 0.9;
    description = "Moderate wear, scale buildup";
  } else {
    efficiency = 0.85;
    description = "Significant wear, consider replacement";
  }

  return {
    ageYears: Math.round(ageYears * 10) / 10,
    efficiency,
    description,
  };
}

/**
 * Estimate boiler age from EPC data.
 *
 * Tries to extract installation date from mainheatDescription
 * (e.g., "Gas Boiler (2018 installed)"), falls back to years since
 * EPC inspection date as conservative estimate.
 *
 * @param mainheatDescription - EPC main heat description field
 * @param epcInspectionDate - EPC inspection date (ISO string)
 * @returns Estimated boiler age in years
 */
export function estimateBoilerAge(
  mainheatDescription: string | null | undefined,
  epcInspectionDate: string | null | undefined,
): number {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Try to extract year from description (e.g. "Boiler 2018")
  if (mainheatDescription) {
    const yearRegex = /\b(19|20)\d{2}\b/;
    const yearMatch = yearRegex.exec(mainheatDescription);
    if (yearMatch) {
      const year = parseInt(yearMatch[0], 10);
      if (year >= 1980 && year <= currentYear) {
        return currentYear - year;
      }
    }
  }

  // Fall back: use EPC inspection date as proxy
  // Assume boiler is ~as old as the last EPC inspection
  // (conservative: boiler might be older)
  if (epcInspectionDate) {
    try {
      const inspectionYear = new Date(epcInspectionDate).getFullYear();
      if (inspectionYear >= 1980 && inspectionYear <= currentYear) {
        return currentYear - inspectionYear;
      }
    } catch {
      // Date parse failed
    }
  }

  // Default: assume UK average boiler age (~8 years)
  return 8;
}

/**
 * Heat pump COP (Coefficient of Performance) by age.
 *
 * COP represents the ratio of heat output to electrical input.
 * COP degrades slightly with age due to compressor wear and refrigerant loss.
 *
 * Typical values:
 *   <3 years:  3.0 COP (300% efficiency equivalent)
 *   3-5 years: 2.8 COP (280% efficiency equivalent)
 *   5+ years:  2.0 COP (200% efficiency equivalent)
 *
 * For NEW heat pumps (not yet installed): assume 3.0 COP
 */
export function getHeatPumpCOP(ageYears: number): number {
  if (ageYears < 3) {
    return 3.0;
  }
  if (ageYears < 5) {
    return 2.8;
  }
  return 2.0;
}
