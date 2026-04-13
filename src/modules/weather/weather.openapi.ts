import type { ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import { errorResponseSchema } from "../../http/openapi-shared";

/**
 * OpenAPI paths + schemas for the weather module.
 *
 * Response schemas are exported as types so the router can type
 * `Response<WeatherForecastResponse>` and get compile-time safety.
 */

// ── Request schemas ──────────────────────────────────────────────

export const weatherForecastQuerySchema = z.object({
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
});

export type WeatherForecastQuery = z.infer<typeof weatherForecastQuerySchema>;

// ── Response schemas ────────────────────────────────────────────

const dailyForecastSchema = z.object({
  date: z.string().describe("Date in YYYY-MM-DD format"),
  temperatureMin: z.number().describe("Minimum temperature (°C)"),
  temperatureMax: z.number().describe("Maximum temperature (°C)"),
  weatherCode: z.number().int().describe("WMO weather code"),
  shortwaveRadiation: z.number().nonnegative().describe("Shortwave radiation sum (MJ/m²)"),
});

export const weatherForecastResponseSchema = z
  .object({
    dailyForecasts: z.array(dailyForecastSchema).describe("7-day daily forecasts"),
    temperatureMin: z.number().describe("Overall minimum temperature across 7 days (°C)"),
    temperatureMax: z.number().describe("Overall maximum temperature across 7 days (°C)"),
    dominantWeatherCode: z.number().int().describe("Most common WMO weather code"),
  })
  .meta({ id: "WeatherForecastResponse" });

export type WeatherForecastResponse = z.infer<typeof weatherForecastResponseSchema>;

// ── Paths ────────────────────────────────────────────────────────

export const weatherPaths: ZodOpenApiPathsObject = {
  "/api/weather/forecast": {
    get: {
      tags: ["weather"],
      summary: "Get 7-day weather forecast",
      description:
        "Fetch 7-day weather forecast for given coordinates with daily temperature, weather code, and solar radiation data.",
      security: [{ bearerAuth: [] }],
      requestParams: { query: weatherForecastQuerySchema },
      responses: {
        "200": {
          description: "Weather forecast data",
          content: {
            "application/json": { schema: weatherForecastResponseSchema },
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
          description: "Weather API error",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "503": {
          description: "Weather API unavailable",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
  },
};
