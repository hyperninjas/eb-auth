/**
 * Warm Homes: Local Grant (WH:LG) eligibility checker.
 * Pure function — no DB or HTTP calls.
 *
 * Eligibility:
 * - EPC rating D, E, F, or G (energy-inefficient)
 * - Located in England
 * - Low-income household (income verification required)
 *
 * Covers:
 * - Up to £15,000 for insulation/solar
 * - Up to £15,000 for low-carbon heating
 */

import {
  WARM_HOMES_LOCAL,
  ENERGY_THRESHOLDS,
  extractRegionFromPostcode,
} from "../data/grant-thresholds";

export interface WhlEligibilityInput {
  postcode: string;
  currentEnergyRating: string | null;
  energyConsumptionCurrent: number | null;
  householdIncome: "low" | "medium" | "high" | null;
}

export interface WhlEligibilityResult {
  fullyEligible: boolean;
  partiallyEligible: boolean;
  reasons: string[];
  gaps: string[];
  estimatedAmount: number;
  measures: string[];
  nextSteps: string[];
}

/**
 * Check if property is eligible for Warm Homes: Local Grant.
 */
export function checkWhlEligibility(input: WhlEligibilityInput): WhlEligibilityResult {
  const reasons: string[] = [];
  const gaps: string[] = [];
  const measures: string[] = [];
  let estimatedAmount = 0;

  // ── Check 1: Location (England only) ───────────────────────────────

  const region = extractRegionFromPostcode(input.postcode);
  const isInEngland = region === "England";

  if (isInEngland) {
    reasons.push("Location: England (eligible region)");
  } else if (region !== "Unknown") {
    gaps.push(`Location: ${region} (not eligible - only England supported)`);
  }

  // ── Check 2: EPC Rating (D-G range) ────────────────────────────────

  const epcRating = input.currentEnergyRating?.toUpperCase() ?? null;
  const isInDtoGRange =
    epcRating !== null && WARM_HOMES_LOCAL.eligibleEpcRatings.includes(epcRating);

  if (isInDtoGRange) {
    reasons.push(`EPC rating: ${epcRating} (eligible range D-G)`);
    estimatedAmount += WARM_HOMES_LOCAL.maxInsulationGrant;
    measures.push("Insulation improvements");
    measures.push("Solar PV installation");
  } else if (epcRating) {
    gaps.push(`EPC rating: ${epcRating} (too efficient - must be D-G)`);
  } else {
    gaps.push("EPC rating unknown");
  }

  // ── Check 3: Energy Intensity (as indicator of poor insulation) ─────

  if (input.energyConsumptionCurrent !== null && input.energyConsumptionCurrent !== undefined) {
    const intensity = input.energyConsumptionCurrent;

    if (intensity > ENERGY_THRESHOLDS.suitable) {
      reasons.push(
        `Energy intensity: ${intensity.toFixed(1)} kWh/m² (poor - eligible for support)`,
      );
      // Only add heating grant if not already added
      if (!estimatedAmount) estimatedAmount = WARM_HOMES_LOCAL.maxHeatingGrant;
      measures.push("Low-carbon heating (heat pump)");
    } else if (intensity > ENERGY_THRESHOLDS.highly_suitable) {
      reasons.push(
        `Energy intensity: ${intensity.toFixed(1)} kWh/m² (acceptable, minor upgrades help)`,
      );
    }
  }

  // ── Check 4: Income Level ──────────────────────────────────────────

  if (input.householdIncome === "low") {
    reasons.push("Household income: Low (fully eligible for grant)");
    if (!estimatedAmount) estimatedAmount = WARM_HOMES_LOCAL.maxInsulationGrant;
  } else if (input.householdIncome === "medium") {
    // Medium-income may be eligible in some cases
    reasons.push("Household income: Medium (may be eligible with other factors)");
  } else if (input.householdIncome === "high") {
    gaps.push("Household income: High (not eligible for WH:LG)");
  } else {
    gaps.push("Income level unknown (required for eligibility)");
  }

  // ── Calculate Eligibility ──────────────────────────────────────────

  const fullyEligible = isInEngland && isInDtoGRange && input.householdIncome === "low";
  const partiallyEligible = isInEngland && isInDtoGRange;

  // Cap estimate at total max
  estimatedAmount = Math.min(estimatedAmount, WARM_HOMES_LOCAL.totalMaxGrant);

  return {
    fullyEligible,
    partiallyEligible,
    reasons,
    gaps,
    estimatedAmount,
    measures,
    nextSteps: fullyEligible
      ? [
          `Apply for up to £${estimatedAmount}`,
          "Contact your local authority for WH:LG application",
          "Verify income documentation (usually last 2 years tax returns)",
          "Get surveys from approved installers",
          "See: https://www.gov.uk/guidance/warm-homes-local-grant",
        ]
      : [
          "Check your income eligibility",
          "Contact local authority to discuss your property",
          "May qualify for ECO4 if you're vulnerable or low-income",
        ],
  };
}
