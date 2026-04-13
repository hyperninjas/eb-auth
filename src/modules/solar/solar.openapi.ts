import type { ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import { errorResponseSchema } from "../../http/openapi-shared";

/**
 * OpenAPI paths + schemas for the solar module.
 *
 * Response schemas are exported as types so the router can type
 * `Response<SolarForecastResponse>` and get compile-time safety.
 */

// ── Request schemas ──────────────────────────────────────────────

export const solarForecastQuerySchema = z.object({
  latitude: z
    .string()
    .regex(/^-?[0-9]+(\.[0-9]+)?$/)
    .transform((v) => parseFloat(v))
    .refine((v) => v >= -90 && v <= 90, "Latitude must be between -90 and 90")
    .describe("Latitude coordinate (-90 to 90)"),

  longitude: z
    .string()
    .regex(/^-?[0-9]+(\.[0-9]+)?$/)
    .transform((v) => parseFloat(v))
    .refine((v) => v >= -180 && v <= 180, "Longitude must be between -180 and 180")
    .describe("Longitude coordinate (-180 to 180)"),

  capacityKwp: z.coerce
    .number()
    .positive("Capacity must be positive")
    .default(5)
    .describe("Solar array capacity in kWp"),

  tilt: z.coerce
    .number()
    .int()
    .min(0, "Tilt must be at least 0 degrees")
    .max(90, "Tilt must be at most 90 degrees")
    .default(30)
    .describe("Panel tilt angle in degrees (0-90)"),

  orientation: z.coerce
    .number()
    .int()
    .min(0, "Orientation must be at least 0 degrees")
    .max(360, "Orientation must be at most 360 degrees")
    .default(180)
    .describe("Panel orientation in degrees (0-360, 180=south)"),
});

export type SolarForecastQuery = z.infer<typeof solarForecastQuerySchema>;

// ── Response schemas ────────────────────────────────────────────

const solarForecastEntrySchema = z.object({
  timestamp: z.string().describe("ISO 8601 timestamp"),
  powerKw: z.number().nonnegative().describe("Predicted power generation in kW"),
});

export const solarForecastResponseSchema = z
  .object({
    entries: z.array(solarForecastEntrySchema).describe("Hourly forecast entries (48 hours)"),
    totalYieldKwh: z
      .number()
      .nonnegative()
      .describe("Total predicted yield across all hours (kWh)"),
  })
  .meta({ id: "SolarForecastResponse" });

export type SolarForecastResponse = z.infer<typeof solarForecastResponseSchema>;

// ── Paths ────────────────────────────────────────────────────────

export const solarPaths: ZodOpenApiPathsObject = {
  "/api/solar/forecast": {
    get: {
      tags: ["solar"],
      summary: "Get 48-hour solar forecast",
      description:
        "Fetch hourly solar power generation forecast for given coordinates and panel configuration.",
      security: [{ bearerAuth: [] }],
      requestParams: { query: solarForecastQuerySchema },
      responses: {
        "200": {
          description: "Solar forecast data",
          content: {
            "application/json": { schema: solarForecastResponseSchema },
          },
        },
        "400": {
          description: "Invalid parameters",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "401": {
          description: "Unauthorized",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "502": {
          description: "Solar API error",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "503": {
          description: "Solar API unavailable",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
  },
};
