/**
 * Smart Export Guarantee (SEG) eligibility checker.
 * Pure function — no DB or HTTP calls.
 *
 * Eligibility:
 * - Has solar PV system (0.5–10 kWp)
 * - MCS-registered installation (Microgeneration Certification Scheme)
 * - Surplus generation to export to grid
 *
 * Benefit:
 * - Energy supplier pays for every kWh exported
 * - Typical rates: 12–24p/kWh (Octopus: 15p/kWh)
 */

import { SEG } from "../data/grant-thresholds";

export interface SegEligibilityInput {
  hasSolarPv: boolean;
  solarCapacityKwp: number;
  dailyConsumptionKwh: number;
  solarMcsRegistered: boolean | null;
  mcsInstallerId: string | null;
}

export interface SegEligibilityResult {
  fullyEligible: boolean;
  partiallyEligible: boolean;
  reasons: string[];
  gaps: string[];
  estimatedDailyExportKwh: number;
  estimatedAnnualRevenueGbp: {
    min: number;
    typical: number;
    max: number;
  };
  nextSteps: string[];
}

/**
 * Check if property is eligible for Smart Export Guarantee.
 */
export function checkSegEligibility(input: SegEligibilityInput): SegEligibilityResult {
  const reasons: string[] = [];
  const gaps: string[] = [];

  // ── Check 1: Solar PV System ───────────────────────────────────────

  if (!input.hasSolarPv) {
    gaps.push("No solar PV detected");
    return {
      fullyEligible: false,
      partiallyEligible: false,
      reasons,
      gaps,
      estimatedDailyExportKwh: 0,
      estimatedAnnualRevenueGbp: { min: 0, typical: 0, max: 0 },
      nextSteps: ["Install solar PV to become eligible for SEG"],
    };
  }

  // Check capacity range
  const capacity = input.solarCapacityKwp;

  if (capacity < SEG.minCapacityKwp) {
    gaps.push(`System too small: ${capacity} kWp (minimum ${SEG.minCapacityKwp} kWp)`);
  } else if (capacity > SEG.maxCapacityKwp) {
    gaps.push(`System may be too large: ${capacity} kWp (typical max ${SEG.maxCapacityKwp} kWp)`);
  } else {
    reasons.push(`Solar PV system: ${capacity} kWp (eligible range)`);
  }

  // ── Check 2: MCS Registration ──────────────────────────────────────

  if (input.solarMcsRegistered === true) {
    reasons.push("Installation: MCS-registered (required for SEG)");
    if (input.mcsInstallerId) {
      reasons.push(`MCS Installer ID: ${input.mcsInstallerId}`);
    }
  } else if (input.solarMcsRegistered === false) {
    gaps.push("Installation: Not MCS-registered (required for SEG eligibility)");
  } else {
    gaps.push("MCS registration status unknown (required for SEG)");
  }

  // ── Calculate Export Estimate ──────────────────────────────────────

  // Rough estimate:
  // - Assume 4 kWh generated per kWp on average (UK annual)
  // - User consumes ~15 kWh/day on average
  // - Export = generation - consumption

  const estimatedDailyGenerationKwh = capacity * 4; // Conservative: 4 kWh/kWp/day average
  const estimatedDailyExportKwh = Math.max(
    0,
    estimatedDailyGenerationKwh - input.dailyConsumptionKwh,
  );

  const estimatedAnnualExportKwh = estimatedDailyExportKwh * 365;

  const estimatedAnnualRevenueGbp = {
    min: Math.round((estimatedAnnualExportKwh * SEG.typicalExportRate.min) / 100),
    typical: Math.round((estimatedAnnualExportKwh * SEG.typicalExportRate.typical) / 100),
    max: Math.round((estimatedAnnualExportKwh * SEG.typicalExportRate.max) / 100),
  };

  // ── Calculate Eligibility ──────────────────────────────────────────

  const fullyEligible =
    input.hasSolarPv &&
    capacity >= SEG.minCapacityKwp &&
    capacity <= SEG.maxCapacityKwp &&
    input.solarMcsRegistered === true;
  const partiallyEligible = input.hasSolarPv && capacity >= SEG.minCapacityKwp;

  return {
    fullyEligible,
    partiallyEligible,
    reasons,
    gaps,
    estimatedDailyExportKwh,
    estimatedAnnualRevenueGbp,
    nextSteps: fullyEligible
      ? [
          `Annual revenue estimate: £${estimatedAnnualRevenueGbp.typical} (typical, Octopus 15p/kWh)`,
          "Compare rates across energy suppliers:",
          "  • Octopus Energy: 15p/kWh (as of 2026)",
          "  • Leccy: Varies by region",
          "  • Ecotricity: 25p/kWh (premium)",
          "Sign up for SEG export scheme with chosen supplier",
          "Get Smart Meter installed if not already",
        ]
      : input.hasSolarPv
        ? [
            "Confirm MCS registration status with installer",
            "If not MCS-registered, retrofit inspection may be possible",
            "Contact: Microgeneration Certification Scheme (MCS) for options",
          ]
        : ["Install solar PV to participate in SEG"],
  };
}
