/**
 * OpenAPI paths + response schemas for the energy-profile module.
 *
 * Response schemas are exported as types so controllers can type
 * `Response<T>` for compile-time safety.
 */

import type { ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import { errorResponseSchema } from "../../http/openapi-shared";
import {
  createProfileSchema,
  createLoadProfileSchema,
  updateLoadProfileSchema,
  providerIdParamSchema,
} from "./energy-profile.schema";

// ── Response schemas ────────────────────────────────────────────────

const hardwareSchema = z
  .object({
    solar: z.object({
      detected: z.boolean(),
      birthDate: z.string().nullable(),
      estimatedPanelCount: z.number(),
      estimatedPanelWattage: z.number(),
      panelTechnology: z.string(),
      estimatedCapacityKwp: z.number(),
      confidence: z.enum(["high", "medium", "low"]),
      manualSurveyRequired: z.boolean(),
    }),
    battery: z.object({
      probability: z.number(),
      estimatedCapacityKwh: z.number(),
      recommendation: z.string().nullable(),
    }),
    heatPump: z.object({
      detected: z.boolean(),
      birthDate: z.string().nullable(),
      type: z.enum(["air-source", "ground-source", "unknown"]).nullable(),
      readiness: z.enum(["highly_suitable", "suitable", "insulation_required", "unknown"]),
      readinessScore: z.number().nullable(),
    }),
  })
  .meta({ id: "HardwareExtrapolation" });

const propertyProfileResponseSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string(),
    uprn: z.string().nullable(),
    lmkKey: z.string(),
    address: z.string(),
    postcode: z.string(),
    propertyType: z.string(),
    builtForm: z.string(),
    totalFloorArea: z.number(),
    hardware: hardwareSchema.nullable(),
    userVerified: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "PropertyProfileResponse" });

const epcHistorySchema = z
  .object({
    id: z.string().uuid(),
    lmkKey: z.string(),
    inspectionDate: z.string(),
    lodgementDate: z.string(),
    mainheatDescription: z.string().nullable(),
    photoSupply: z.string().nullable(),
    spaceHeatingDemand: z.number().nullable(),
    energyConsumptionCurrent: z.number().nullable(),
  })
  .meta({ id: "EpcHistory" });

const providerSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  })
  .meta({ id: "EnergyProvider" });

const tariffSchema = z
  .object({
    id: z.string().uuid(),
    providerId: z.string().uuid(),
    providerName: z.string().optional(),
    name: z.string(),
    tariffType: z.string(),
    flatRatePence: z.number().nullable(),
    peakRatePence: z.number().nullable(),
    offPeakRatePence: z.number().nullable(),
    peakStartHour: z.number().nullable(),
    peakEndHour: z.number().nullable(),
    standingChargePence: z.number(),
    segExportRatePence: z.number().nullable(),
    isDefault: z.boolean(),
    validFrom: z.string(),
    validTo: z.string().nullable(),
    source: z.string(),
  })
  .meta({ id: "EnergyTariff" });

const loadProfileSchema = z
  .object({
    id: z.string().uuid(),
    profileId: z.string().uuid(),
    providerId: z.string().uuid(),
    tariffId: z.string().uuid(),
    monthlyBillPence: z.number(),
    dailyKwh: z.number(),
    hourlyDistribution: z.array(z.number()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "UserLoadProfile" });

const tariffRefreshResponseSchema = z
  .object({
    providersUpserted: z.number(),
    tariffsUpserted: z.number(),
  })
  .meta({ id: "TariffRefreshResponse" });

// ── Paths ───────────────────────────────────────────────────────────

const authSecurity = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });
const errResp = (desc: string) => ({ description: desc, ...json(errorResponseSchema) });

export const energyProfilePaths: ZodOpenApiPathsObject = {
  "/api/energy-profile/profile": {
    post: {
      tags: ["energy-profile"],
      summary: "Create property profile from EPC certificate",
      security: authSecurity,
      requestBody: json(createProfileSchema),
      responses: {
        "201": {
          description: "Profile created with hardware extrapolation",
          ...json(propertyProfileResponseSchema),
        },
        "400": errResp("Validation error or insufficient EPC data"),
        "401": errResp("Unauthorized"),
        "409": errResp("Profile already exists"),
      },
    },
    get: {
      tags: ["energy-profile"],
      summary: "Get current user's property profile",
      security: authSecurity,
      responses: {
        "200": { description: "Property profile", ...json(propertyProfileResponseSchema) },
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
    delete: {
      tags: ["energy-profile"],
      summary: "Delete property profile and all related data",
      security: authSecurity,
      responses: {
        "204": { description: "Profile deleted" },
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/profile/refresh": {
    post: {
      tags: ["energy-profile"],
      summary: "Force-refresh profile from EPC API",
      description:
        "Re-fetches EPC data, re-runs UPRN Time Machine and hardware extrapolation, invalidates all caches.",
      security: authSecurity,
      responses: {
        "200": { description: "Refreshed profile", ...json(propertyProfileResponseSchema) },
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/profile/history": {
    get: {
      tags: ["energy-profile"],
      summary: "Get UPRN historical EPC certificates",
      description:
        "All historical certificates for this property's UPRN, sorted chronologically (oldest first).",
      security: authSecurity,
      responses: {
        "200": { description: "Historical certificates", ...json(z.array(epcHistorySchema)) },
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/tariffs": {
    get: {
      tags: ["energy-profile"],
      summary: "List all energy tariffs",
      security: authSecurity,
      responses: {
        "200": { description: "Tariff list", ...json(z.array(tariffSchema)) },
        "401": errResp("Unauthorized"),
      },
    },
  },
  "/api/energy-profile/tariffs/providers": {
    get: {
      tags: ["energy-profile"],
      summary: "List UK energy providers",
      security: authSecurity,
      responses: {
        "200": { description: "Provider list", ...json(z.array(providerSchema)) },
        "401": errResp("Unauthorized"),
      },
    },
  },
  "/api/energy-profile/tariffs/{providerId}": {
    get: {
      tags: ["energy-profile"],
      summary: "List tariffs for a specific provider",
      security: authSecurity,
      requestParams: { path: providerIdParamSchema },
      responses: {
        "200": { description: "Provider tariffs", ...json(z.array(tariffSchema)) },
        "401": errResp("Unauthorized"),
        "404": errResp("Provider not found"),
      },
    },
  },
  "/api/energy-profile/tariffs/refresh": {
    post: {
      tags: ["energy-profile"],
      summary: "Refresh tariff data from external sources",
      description:
        "Seeds/updates all 18 UK providers with Ofgem SVT rates and fetches latest Octopus Energy tariffs.",
      security: authSecurity,
      responses: {
        "200": { description: "Refresh result", ...json(tariffRefreshResponseSchema) },
        "401": errResp("Unauthorized"),
      },
    },
  },
  "/api/energy-profile/load-profile": {
    post: {
      tags: ["energy-profile"],
      summary: "Set energy consumption profile",
      description:
        "Select your energy provider, tariff, and monthly bill to derive daily kWh and hourly load curve.",
      security: authSecurity,
      requestBody: json(createLoadProfileSchema),
      responses: {
        "201": { description: "Load profile created", ...json(loadProfileSchema) },
        "400": errResp("Validation error"),
        "401": errResp("Unauthorized"),
        "404": errResp("Property profile or tariff not found"),
      },
    },
    get: {
      tags: ["energy-profile"],
      summary: "Get current load profile",
      security: authSecurity,
      responses: {
        "200": { description: "Load profile", ...json(loadProfileSchema) },
        "401": errResp("Unauthorized"),
        "404": errResp("Not found"),
      },
    },
    patch: {
      tags: ["energy-profile"],
      summary: "Update load profile",
      security: authSecurity,
      requestBody: json(updateLoadProfileSchema),
      responses: {
        "200": { description: "Updated load profile", ...json(loadProfileSchema) },
        "400": errResp("Validation error"),
        "401": errResp("Unauthorized"),
        "404": errResp("Not found"),
      },
    },
  },
  "/api/energy-profile/forecast/solar": {
    get: {
      tags: ["energy-profile"],
      summary: "Hourly solar forecast by season",
      description:
        "Estimated hourly solar generation curves for summer, winter, and shoulder seasons based on derived system capacity and PVGIS irradiance data.",
      security: authSecurity,
      responses: {
        "200": { description: "Solar forecast" },
        "400": errResp("Insufficient data"),
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/forecast/cost-impact": {
    get: {
      tags: ["energy-profile"],
      summary: "Cost impact of solar and battery",
      description:
        "Hour-by-hour simulation of solar generation, battery storage, and grid interaction translated into financial savings.",
      security: authSecurity,
      responses: {
        "200": { description: "Cost impact analysis" },
        "400": errResp("Insufficient data or load profile not set"),
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/forecast/tariff-comparison": {
    get: {
      tags: ["energy-profile"],
      summary: "SVT vs Time-of-Use tariff comparison",
      description:
        "Financial comparison between Standard Variable Tariff and smart Time-of-Use tariff, including overnight battery charging optimisation.",
      security: authSecurity,
      responses: {
        "200": { description: "Tariff comparison" },
        "400": errResp("Insufficient data"),
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/forecast/heat-pump": {
    get: {
      tags: ["energy-profile"],
      summary: "Heat pump running cost simulation",
      description:
        "Converts gas heating demand to electrical via heat pump COP, adds to load profile, and recalculates tariff comparison.",
      security: authSecurity,
      responses: {
        "200": { description: "Heat pump simulation" },
        "400": errResp("Insufficient data"),
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
  "/api/energy-profile/forecast/summary": {
    get: {
      tags: ["energy-profile"],
      summary: "All four forecast functions combined",
      description:
        "Runs all forecast functions in parallel and returns combined results. Individual forecasts may be null if data is insufficient.",
      security: authSecurity,
      responses: {
        "200": { description: "Combined forecast summary" },
        "401": errResp("Unauthorized"),
        "404": errResp("No profile found"),
      },
    },
  },
};
