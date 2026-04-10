import type { ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import { errorResponseSchema } from "../../http/openapi-shared";

/**
 * OpenAPI paths + schemas for the EPC module.
 *
 * Response schemas are exported as types so the router can type
 * `Response<EpcSearchResponse>` and get compile-time safety between
 * the published spec and the actual wire body.
 */

// ── Request schemas ──────────────────────────────────────────────────

export const epcSearchQuerySchema = z.object({
  postcode: z.string().min(1).describe("UK postcode to search (e.g. SW1A1AA)"),
  from: z.coerce.number().int().nonnegative().default(0).describe("Pagination offset"),
  size: z.coerce.number().int().positive().max(100).default(50).describe("Page size"),
});
export type EpcSearchQuery = z.infer<typeof epcSearchQuerySchema>;

export const epcCertParamSchema = z.object({
  lmkKey: z.string().min(1).describe("LMK key (unique certificate identifier)"),
});
export type EpcCertParam = z.infer<typeof epcCertParamSchema>;

// ── Response schemas ─────────────────────────────────────────────────

// Certificate shape — open record because the EPC API returns 60+ fields
// and we forward all of them. We explicitly list the most-used ones for
// documentation but allow any additional string fields.
const epcCertificateSchema = z
  .object({
    lmkKey: z.string(),
    address: z.string(),
    postcode: z.string(),
    currentEnergyRating: z.string(),
    currentEnergyEfficiency: z.string(),
    potentialEnergyRating: z.string(),
    potentialEnergyEfficiency: z.string(),
    propertyType: z.string(),
    builtForm: z.string(),
    inspectionDate: z.string(),
    lodgementDate: z.string(),
    totalFloorArea: z.string(),
    co2EmissionsCurrent: z.string(),
    co2EmissionsPotential: z.string(),
    heatingCostCurrent: z.string(),
    heatingCostPotential: z.string(),
    hotWaterCostCurrent: z.string(),
    hotWaterCostPotential: z.string(),
    lightingCostCurrent: z.string(),
    lightingCostPotential: z.string(),
    energyConsumptionCurrent: z.string(),
    energyConsumptionPotential: z.string(),
  })
  .catchall(z.string())
  .meta({ id: "EpcCertificate" });

export const epcSearchResponseSchema = z
  .object({
    rows: z.array(epcCertificateSchema),
    totalResults: z.number().int(),
  })
  .meta({ id: "EpcSearchResponse" });
export type EpcSearchResponse = z.infer<typeof epcSearchResponseSchema>;

export const epcCertificateResponseSchema = z
  .object({
    certificate: epcCertificateSchema.nullable(),
  })
  .meta({ id: "EpcCertificateResponse" });
export type EpcCertificateResponse = z.infer<typeof epcCertificateResponseSchema>;

// ── Paths ────────────────────────────────────────────────────────────

export const epcPaths: ZodOpenApiPathsObject = {
  "/api/epc/search": {
    get: {
      tags: ["epc"],
      summary: "Search domestic properties by postcode",
      description:
        "Searches the UK EPC Open Data Communities register for domestic " +
        "energy performance certificates matching the given postcode.",
      security: [{ bearerAuth: [] }],
      requestParams: { query: epcSearchQuerySchema },
      responses: {
        "200": {
          description: "Search results",
          content: {
            "application/json": { schema: epcSearchResponseSchema },
          },
        },
        "400": {
          description: "Invalid postcode or request",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "401": {
          description: "Unauthorized",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "503": {
          description: "EPC service unavailable",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
  },
  "/api/epc/certificate/{lmkKey}": {
    get: {
      tags: ["epc"],
      summary: "Get a single EPC certificate by LMK key",
      description:
        "Fetches the full energy performance certificate for a specific " +
        "property identified by its LMK key (unique certificate ID).",
      security: [{ bearerAuth: [] }],
      requestParams: { path: epcCertParamSchema },
      responses: {
        "200": {
          description: "Certificate details (null if not found)",
          content: {
            "application/json": { schema: epcCertificateResponseSchema },
          },
        },
        "401": {
          description: "Unauthorized",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "503": {
          description: "EPC service unavailable",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
  },
};
