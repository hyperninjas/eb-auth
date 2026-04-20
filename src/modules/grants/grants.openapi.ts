/**
 * OpenAPI paths + response schemas for the grants module.
 */

import type { ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import { errorResponseSchema } from "../../http/openapi-shared";

// ── Response Schemas ─────────────────────────────────────────────────

const grantEligibilityDetailSchema = z
  .object({
    grantId: z.string(),
    name: z.string(),
    description: z.string(),
    fullyEligible: z.boolean(),
    partiallyEligible: z.boolean(),
    reasons: z.array(z.string()),
    gaps: z.array(z.string()),
    estimatedAmount: z.number().optional(),
    estimatedAnnualValue: z.number().optional(),
    measures: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()),
  })
  .meta({ id: "GrantEligibilityDetail" });

const grantSummarySchema = z
  .object({
    totalEligibleGrants: z.number(),
    totalPartiallyEligible: z.number(),
    totalEstimatedValue: z.number(),
    prioritizedActions: z.array(
      z.object({
        priority: z.enum(["high", "medium", "low"]),
        grant: z.string(),
        action: z.string(),
        amount: z.number().optional(),
        reason: z.string(),
      }),
    ),
  })
  .meta({ id: "GrantSummary" });

const userGrantProfileSchema = z
  .object({
    userId: z.string(),
    isHomeowner: z.boolean().nullable(),
    householdIncome: z.enum(["low", "medium", "high"]).nullable(),
    hasVulnerableOccupant: z.boolean().nullable(),
    solarMcsRegistered: z.boolean().nullable(),
    mcsInstallerId: z.string().nullable(),
    lastAssessedAt: z.string(),
  })
  .meta({ id: "UserGrantProfile" });

const grantEligibilityResponseSchema = z
  .object({
    userId: z.string(),
    boilerUpgradeScheme: grantEligibilityDetailSchema,
    warmHomesLocal: grantEligibilityDetailSchema,
    eco4: grantEligibilityDetailSchema,
    smartExportGuarantee: grantEligibilityDetailSchema,
    summary: grantSummarySchema,
    lastAssessedAt: z.string(),
  })
  .meta({ id: "GrantEligibilityResponse" });

// ── Paths ────────────────────────────────────────────────────────────

const authSecurity = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });
const errResp = (desc: string) => ({ description: desc, ...json(errorResponseSchema) });

export const grantsPaths: ZodOpenApiPathsObject = {
  "/api/grants/profile": {
    get: {
      tags: ["grants"],
      summary: "Get user's grant eligibility answers",
      description: "Retrieve the grant profile with answers user has already provided.",
      security: authSecurity,
      responses: {
        "200": {
          description: "Grant profile",
          ...json(userGrantProfileSchema),
        },
        "401": errResp("Unauthorized"),
        "404": errResp("Grant profile not found"),
      },
    },
    patch: {
      tags: ["grants"],
      summary: "Update grant eligibility answers",
      description:
        "Save or update user's answers about homeownership, income, vulnerabilities, and solar registration.",
      security: authSecurity,
      requestBody: json(
        z.object({
          isHomeowner: z.boolean().optional(),
          householdIncome: z.enum(["low", "medium", "high"]).optional(),
          hasVulnerableOccupant: z.boolean().optional(),
          solarMcsRegistered: z.boolean().optional(),
          mcsInstallerId: z.string().optional(),
        }),
      ),
      responses: {
        "200": {
          description: "Grant profile updated",
          ...json(userGrantProfileSchema),
        },
        "400": errResp("Validation error"),
        "401": errResp("Unauthorized"),
      },
    },
  },
  "/api/grants/eligibility": {
    get: {
      tags: ["grants"],
      summary: "Check all grant eligibility",
      description:
        "Comprehensive eligibility assessment across all 4 UK grants (BUS, WH:LG, ECO4, SEG). Combines EPC data with user-provided answers.",
      security: authSecurity,
      responses: {
        "200": {
          description: "Grant eligibility results",
          ...json(grantEligibilityResponseSchema),
        },
        "401": errResp("Unauthorized"),
        "404": errResp("Property profile not found (set up energy profile first)"),
      },
    },
  },
};
