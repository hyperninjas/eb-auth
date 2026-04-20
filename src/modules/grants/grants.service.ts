/**
 * Grants service — orchestration layer.
 * Coordinates between eligibility engines, repository, and business logic.
 */

import { getLogger } from "../../infra/logger";
import { prisma } from "../../infra/prisma";
import type { HardwareExtrapolation } from "../energy-profile/engines/hardware-extrapolation";
import { checkBusEligibility } from "./engines/bus-checker";
import { checkWhlEligibility } from "./engines/whl-checker";
import { checkEco4Eligibility } from "./engines/eco4-checker";
import { checkSegEligibility } from "./engines/seg-checker";
import { grantsRepository } from "./grants.repository";
import type { UpdateGrantProfileInput } from "./grants.schema";
import { GrantProfileNotFoundError, PropertyProfileNotFoundError } from "./grants.errors";
import type {
  GrantEligibilityResponse,
  UserGrantProfileDTO,
  GrantEligibilitySummary,
} from "./grants.dto";

export function createGrantsService() {
  return {
    /**
     * Get user's current grant profile (answers already provided).
     */
    async getGrantProfile(userId: string): Promise<UserGrantProfileDTO> {
      const profile = await grantsRepository.findGrantProfileByUserId(userId);

      if (!profile) {
        throw new GrantProfileNotFoundError(userId);
      }

      return {
        userId: profile.userId,
        isHomeowner: profile.isHomeowner,
        householdIncome: profile.householdIncome as "low" | "medium" | "high" | null,
        hasVulnerableOccupant: profile.hasVulnerableOccupant,
        solarMcsRegistered: profile.solarMcsRegistered,
        mcsInstallerId: profile.mcsInstallerId,
        lastAssessedAt: profile.lastAssessedAt.toISOString(),
      };
    },

    /**
     * Update user's grant profile answers.
     * Upserts (creates if not exists, updates if exists).
     */
    async updateGrantProfile(
      userId: string,
      input: UpdateGrantProfileInput,
    ): Promise<UserGrantProfileDTO> {
      const profile = await grantsRepository.upsertGrantProfile(userId, input);

      getLogger().info({ userId }, "Grant profile updated");

      return {
        userId: profile.userId,
        isHomeowner: profile.isHomeowner,
        householdIncome: profile.householdIncome as "low" | "medium" | "high" | null,
        hasVulnerableOccupant: profile.hasVulnerableOccupant,
        solarMcsRegistered: profile.solarMcsRegistered,
        mcsInstallerId: profile.mcsInstallerId,
        lastAssessedAt: profile.lastAssessedAt.toISOString(),
      };
    },

    /**
     * Check all grant eligibility for a user.
     * Orchestrates all 4 eligibility engines.
     */
    async checkEligibility(userId: string): Promise<GrantEligibilityResponse> {
      // Fetch property profile (EPC data is required)
      const propertyProfile = await prisma.propertyProfile.findUnique({
        where: { userId },
      });

      if (!propertyProfile) {
        throw new PropertyProfileNotFoundError(userId);
      }

      // Fetch grant profile (answers user has provided)
      const grantProfile = await grantsRepository.findGrantProfileByUserId(userId);

      // Fetch load profile (for consumption data)
      const loadProfile = await prisma.userLoadProfile.findUnique({
        where: { profileId: propertyProfile.id },
      });

      // Extract data for eligibility checks
      const epcData = propertyProfile.latestEpcData as Record<string, string>;
      const hardware = (propertyProfile.hardware as HardwareExtrapolation | null) ?? {
        solar: { detected: false, estimatedCapacityKwp: 0 },
      };

      const postcode = propertyProfile.postcode;
      const currentEnergyRating = epcData["currentEnergyRating"] ?? null;
      const energyConsumption = safeParseFloat(epcData["energyConsumptionCurrent"]) ?? null;
      const mainheatDescription = epcData["mainheatDescription"] ?? null;

      const isHomeowner = grantProfile?.isHomeowner ?? null;
      const householdIncome =
        (grantProfile?.householdIncome as "low" | "medium" | "high" | null) ?? null;
      const hasVulnerable = grantProfile?.hasVulnerableOccupant ?? null;
      const solarMcsRegistered = grantProfile?.solarMcsRegistered ?? null;
      const mcsInstallerId = grantProfile?.mcsInstallerId ?? null;

      // Run all eligibility checks
      const busBus = checkBusEligibility({
        postcode,
        mainheatDescription,
        isHomeowner,
      });

      const whlWhl = checkWhlEligibility({
        postcode,
        currentEnergyRating,
        energyConsumptionCurrent: energyConsumption,
        householdIncome,
      });

      const eco4Eco4 = checkEco4Eligibility({
        currentEnergyRating,
        energyConsumptionCurrent: energyConsumption,
        householdIncome,
        hasVulnerableOccupant: hasVulnerable,
      });

      const segSeg = checkSegEligibility({
        hasSolarPv: hardware.solar?.detected ?? false,
        solarCapacityKwp: hardware.solar?.estimatedCapacityKwp ?? 0,
        dailyConsumptionKwh: loadProfile?.dailyKwh ?? 15,
        solarMcsRegistered,
        mcsInstallerId,
      });

      // Summarize
      const summary = buildSummary(busBus, whlWhl, eco4Eco4, segSeg);

      // Log assessment
      getLogger().info({ userId }, "Grant eligibility assessed");

      return {
        userId,
        boilerUpgradeScheme: {
          grantId: "bus",
          name: "Boiler Upgrade Scheme",
          description: "£7,500 upfront grant for heat pump installation",
          fullyEligible: busBus.fullyEligible,
          partiallyEligible: busBus.partiallyEligible,
          reasons: busBus.reasons,
          gaps: busBus.gaps,
          estimatedAmount: busBus.estimatedAmount,
          nextSteps: busBus.nextSteps,
        },
        warmHomesLocal: {
          grantId: "whl",
          name: "Warm Homes: Local Grant",
          description: "Up to £30,000 for insulation, solar, and heating",
          fullyEligible: whlWhl.fullyEligible,
          partiallyEligible: whlWhl.partiallyEligible,
          reasons: whlWhl.reasons,
          gaps: whlWhl.gaps,
          estimatedAmount: whlWhl.estimatedAmount,
          measures: whlWhl.measures,
          nextSteps: whlWhl.nextSteps,
        },
        eco4: {
          grantId: "eco4",
          name: "Energy Company Obligation 4",
          description: "Supplier-funded upgrades for low-income/vulnerable homes",
          fullyEligible: eco4Eco4.fullyEligible,
          partiallyEligible: eco4Eco4.partiallyEligible,
          reasons: eco4Eco4.reasons,
          gaps: eco4Eco4.gaps,
          nextSteps: eco4Eco4.nextSteps,
        },
        smartExportGuarantee: {
          grantId: "seg",
          name: "Smart Export Guarantee",
          description: "Get paid for surplus solar energy exported to grid",
          fullyEligible: segSeg.fullyEligible,
          partiallyEligible: segSeg.partiallyEligible,
          reasons: segSeg.reasons,
          gaps: segSeg.gaps,
          estimatedAnnualValue: segSeg.estimatedAnnualRevenueGbp.typical,
          nextSteps: segSeg.nextSteps,
        },
        summary,
        lastAssessedAt: new Date().toISOString(),
      };
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeParseFloat(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function buildSummary(
  bus: ReturnType<typeof checkBusEligibility>,
  whl: ReturnType<typeof checkWhlEligibility>,
  eco4: ReturnType<typeof checkEco4Eligibility>,
  seg: ReturnType<typeof checkSegEligibility>,
): GrantEligibilitySummary {
  const eligible = [bus, whl, eco4, seg].filter((g) => g.fullyEligible).length;
  const partial = [bus, whl, eco4, seg].filter(
    (g) => g.partiallyEligible && !g.fullyEligible,
  ).length;

  const totalValue =
    (bus.fullyEligible ? bus.estimatedAmount : 0) +
    (whl.fullyEligible ? whl.estimatedAmount : 0) +
    (seg.fullyEligible ? seg.estimatedAnnualRevenueGbp.typical : 0);

  const prioritized = [];

  if (bus.fullyEligible) {
    prioritized.push({
      priority: "high" as const,
      grant: "Boiler Upgrade Scheme",
      action: `${bus.recommendedAction ?? "Replace heating system"}`,
      amount: bus.estimatedAmount,
      reason: "Immediate upfront grant available",
    });
  }

  if (whl.fullyEligible) {
    prioritized.push({
      priority: "high" as const,
      grant: "Warm Homes: Local",
      action: "Apply for insulation and heating upgrades",
      amount: whl.estimatedAmount,
      reason: "Significant support for energy efficiency",
    });
  }

  if (seg.fullyEligible) {
    prioritized.push({
      priority: "medium" as const,
      grant: "Smart Export Guarantee",
      action: "Register for SEG export scheme",
      amount: seg.estimatedAnnualRevenueGbp.typical,
      reason: "Ongoing annual income from solar",
    });
  }

  return {
    totalEligibleGrants: eligible,
    totalPartiallyEligible: partial,
    totalEstimatedValue: totalValue,
    prioritizedActions: prioritized,
  };
}
