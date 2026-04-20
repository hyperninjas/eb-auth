/**
 * Energy Company Obligation 4 (ECO4) eligibility checker.
 * Pure function — no DB or HTTP calls.
 *
 * Eligibility:
 * - Home with poor energy efficiency (EPC D-G or high consumption)
 * - Household is low-income, vulnerable, or both
 *
 * Funding:
 * - Energy suppliers provide grants (no application to government)
 * - Covers heat pumps, insulation, solar panels, etc.
 */

import { ECO4, ENERGY_THRESHOLDS } from "../data/grant-thresholds";

export interface Eco4EligibilityInput {
  currentEnergyRating: string | null;
  energyConsumptionCurrent: number | null;
  householdIncome: "low" | "medium" | "high" | null;
  hasVulnerableOccupant: boolean | null;
}

export interface Eco4EligibilityResult {
  fullyEligible: boolean;
  partiallyEligible: boolean;
  reasons: string[];
  gaps: string[];
  qualifyingCriteria: string[];
  nextSteps: string[];
}

/**
 * Check if property is eligible for Energy Company Obligation 4 (ECO4).
 * ECO4 is supplier-funded, so no direct grant from government,
 * but energy suppliers must fund qualifying homes.
 */
export function checkEco4Eligibility(input: Eco4EligibilityInput): Eco4EligibilityResult {
  const reasons: string[] = [];
  const gaps: string[] = [];
  const qualifyingCriteria: string[] = [];

  // ── Check 1: Low Energy Efficiency ──────────────────────────────────

  const epcRating = input.currentEnergyRating?.toUpperCase() ?? null;
  const isEnergyInefficient = epcRating && ECO4.eligibleEpcRatings.includes(epcRating);

  if (isEnergyInefficient) {
    reasons.push(`EPC rating: ${epcRating} (eligible D-G range)`);
    qualifyingCriteria.push("Energy-inefficient home (D-G rated)");
  } else if (
    input.energyConsumptionCurrent !== null &&
    input.energyConsumptionCurrent > ENERGY_THRESHOLDS.suitable
  ) {
    reasons.push(
      `Energy consumption: ${input.energyConsumptionCurrent.toFixed(1)} kWh/m² (poor efficiency)`,
    );
    qualifyingCriteria.push("High energy consumption (inefficient)");
  } else if (epcRating) {
    gaps.push(`EPC rating: ${epcRating} (too efficient - must be D-G for main eligibility)`);
  }

  // ── Check 2: Low Income ────────────────────────────────────────────

  if (input.householdIncome === "low") {
    reasons.push("Household income: Low (eligible for ECO4)");
    qualifyingCriteria.push("Low-income household");
  } else if (input.householdIncome === "medium") {
    gaps.push("Household income: Medium (may not qualify alone)");
  } else if (input.householdIncome === "high") {
    gaps.push("Household income: High (not eligible)");
  } else {
    gaps.push("Income level unknown");
  }

  // ── Check 3: Vulnerable Occupant ───────────────────────────────────

  if (input.hasVulnerableOccupant === true) {
    reasons.push("Household: Contains vulnerable occupant (eligible for ECO4)");
    qualifyingCriteria.push("Vulnerable household member (age 75+, disability, health condition)");
  } else if (input.hasVulnerableOccupant === false) {
    gaps.push("No vulnerable occupant recorded");
  } else {
    gaps.push("Vulnerable occupant status unknown");
  }

  // ── Calculate Eligibility ──────────────────────────────────────────

  // ECO4 requires:
  // - Energy inefficiency (D-G or high consumption) AND
  // - Either low-income OR vulnerable

  const hasEnergyInefficiency =
    (isEnergyInefficient ?? false) ||
    (input.energyConsumptionCurrent ?? 0) > ENERGY_THRESHOLDS.suitable;
  const hasLowIncomeOrVulnerable =
    input.householdIncome === "low" || input.hasVulnerableOccupant === true;

  const fullyEligible = hasEnergyInefficiency && hasLowIncomeOrVulnerable;
  const partiallyEligible = hasEnergyInefficiency;

  return {
    fullyEligible,
    partiallyEligible,
    reasons,
    gaps,
    qualifyingCriteria,
    nextSteps: fullyEligible
      ? [
          "Contact your current energy supplier about ECO4 programs",
          "Most suppliers have ECO4 schemes (British Gas, EDF, E.ON, Octopus, etc.)",
          "No government application required - supplier handles it",
          "Supplier will assess and arrange free/discounted upgrades",
          "See: https://www.gov.uk/guidance/energy-company-obligation-eco",
        ]
      : [
          "Check if you qualify as low-income or vulnerable",
          "Contact energy supplier to discuss your options",
          "Alternative: Check for Warm Homes: Local Grant eligibility",
        ],
  };
}
