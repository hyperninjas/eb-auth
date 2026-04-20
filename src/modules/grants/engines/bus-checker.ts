/**
 * Boiler Upgrade Scheme (BUS) eligibility checker.
 * Pure function — no DB or HTTP calls.
 *
 * Eligibility:
 * - Current heating system is fossil fuel (gas, oil, solid fuel)
 * - Property location in England or Wales
 * - User is homeowner (not renting)
 */

import { BUS, extractRegionFromPostcode } from "../data/grant-thresholds";

export interface BusEligibilityInput {
  postcode: string;
  mainheatDescription: string | null;
  isHomeowner: boolean | null;
}

export interface BusEligibilityResult {
  fullyEligible: boolean;
  partiallyEligible: boolean;
  reasons: string[];
  gaps: string[];
  estimatedAmount: number;
  recommendedAction: string | null;
  nextSteps: string[];
}

/**
 * Check if property is eligible for Boiler Upgrade Scheme.
 * Returns both "fully eligible" (all criteria met) and "partially eligible"
 * (most criteria met, but user hasn't answered homeownership question yet).
 */
export function checkBusEligibility(input: BusEligibilityInput): BusEligibilityResult {
  const reasons: string[] = [];
  const gaps: string[] = [];
  let estimatedAmount = 0;
  let recommendedAction: string | null = null;

  // ── Check 1: Fossil Fuel System ────────────────────────────────────

  const description = input.mainheatDescription?.toLowerCase() ?? "";
  const hasFossilFuel = BUS.fossilFuels.some((fuel) => description.includes(fuel));

  if (hasFossilFuel) {
    // Identify which fossil fuel
    let fuelType = "heating system";
    if (description.includes("gas")) {
      fuelType = "gas boiler";
      estimatedAmount = BUS.grantAmounts.airSourceHeatPump; // Default to air-source
      recommendedAction = "Replace with air source heat pump";
    } else if (description.includes("oil")) {
      fuelType = "oil boiler";
      estimatedAmount = BUS.grantAmounts.airSourceHeatPump;
      recommendedAction = "Replace with heat pump";
    } else if (
      description.includes("solid") ||
      description.includes("coal") ||
      description.includes("wood")
    ) {
      fuelType = "solid fuel boiler";
      estimatedAmount = BUS.grantAmounts.biomassBoiler;
      recommendedAction = "Replace with biomass boiler or heat pump";
    }

    reasons.push(`Current heating: ${fuelType} (eligible for replacement)`);
  } else {
    gaps.push("Current heating system is not fossil fuel (not eligible)");
  }

  // ── Check 2: Location (England/Wales) ──────────────────────────────

  const region = extractRegionFromPostcode(input.postcode);
  const isEligibleRegion = BUS.eligibleRegions.includes(region);

  if (isEligibleRegion) {
    reasons.push(`Location: ${region} (eligible region)`);
  } else if (region !== "Unknown") {
    gaps.push(`Location: ${region} (not eligible - only England/Wales supported)`);
  } else {
    gaps.push("Unable to determine location from postcode");
  }

  // ── Check 3: Homeownership ─────────────────────────────────────────

  if (input.isHomeowner === true) {
    reasons.push("Status: Homeowner confirmed (eligible)");
  } else if (input.isHomeowner === false) {
    gaps.push("Homeownership: You are not the owner (not eligible)");
  } else {
    gaps.push("Homeownership status unknown (required to confirm eligibility)");
  }

  // ── Calculate Eligibility ──────────────────────────────────────────

  const fullyEligible = hasFossilFuel && isEligibleRegion && input.isHomeowner === true;
  const partiallyEligible = hasFossilFuel && isEligibleRegion;

  return {
    fullyEligible,
    partiallyEligible,
    reasons,
    gaps,
    estimatedAmount,
    recommendedAction,
    nextSteps: fullyEligible
      ? [
          `${recommendedAction} to claim £${estimatedAmount}`,
          "Get quotes from MCS-registered installers",
          "Apply at https://www.boilerupgrade.co.uk",
          "Grant is upfront (installer applies on your behalf)",
        ]
      : [
          "Verify your homeownership status to proceed",
          "Contact your energy supplier for other funding options",
        ],
  };
}
