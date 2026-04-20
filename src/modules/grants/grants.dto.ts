/**
 * Response DTOs for the grants module.
 * These are used for type-safe HTTP responses.
 */

// ── Grant Eligibility Result ───────────────────────────────────────

export interface GrantEligibilityDetail {
  grantId: string;
  name: string;
  description: string;
  fullyEligible: boolean;
  partiallyEligible: boolean;
  reasons: string[];
  gaps: string[];
  estimatedAmount?: number;
  estimatedAnnualValue?: number;
  measures?: string[];
  nextSteps: string[];
}

export interface GrantEligibilitySummary {
  totalEligibleGrants: number;
  totalPartiallyEligible: number;
  totalEstimatedValue: number;
  prioritizedActions: {
    priority: "high" | "medium" | "low";
    grant: string;
    action: string;
    amount?: number;
    reason: string;
  }[];
}

export interface GrantEligibilityResponse {
  userId: string;
  boilerUpgradeScheme: GrantEligibilityDetail;
  warmHomesLocal: GrantEligibilityDetail;
  eco4: GrantEligibilityDetail;
  smartExportGuarantee: GrantEligibilityDetail;
  summary: GrantEligibilitySummary;
  lastAssessedAt: string;
}

// ── User Grant Profile ──────────────────────────────────────────────

export interface UserGrantProfileDTO {
  userId: string;
  isHomeowner: boolean | null;
  householdIncome: "low" | "medium" | "high" | null;
  hasVulnerableOccupant: boolean | null;
  solarMcsRegistered: boolean | null;
  mcsInstallerId: string | null;
  lastAssessedAt: string;
}
