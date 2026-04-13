import { z } from "zod";

/**
 * Weather module configuration.
 *
 * Proxies requests to the Open-Meteo API (free, no auth).
 * Module-local config pattern — env vars stay here, not in src/config/env.ts.
 */

const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const WeatherEnvSchema = z.object({
  // Master switch. Set to "true" to mount /api/weather/* routes.
  WEATHER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Open-Meteo API base URL. Defaults to production endpoint.
  WEATHER_API_BASE_URL: z.preprocess(
    blankAsUndefined,
    z.url().default("https://api.open-meteo.com"),
  ),

  // Outbound HTTP timeout for Open-Meteo API (ms).
  WEATHER_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // Redis cache TTL for weather forecasts (seconds).
  // Weather data updates daily (model runs 4x/day); 6h is a good refresh cycle.
  WEATHER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21_600),
});

export interface WeatherConfig {
  enabled: boolean;
  baseUrl: string;
  httpTimeoutMs: number;
  cacheTtlSeconds: number;
}

/**
 * Parse weather env vars. Returns `null` when the module is disabled,
 * allowing `createWeatherModule()` to skip activation cleanly.
 */
export function loadWeatherConfig(): WeatherConfig | null {
  const parsed = WeatherEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Weather env validation failed: ${JSON.stringify(z.treeifyError(parsed.error))}`,
    );
  }
  const env = parsed.data;
  if (!env.WEATHER_ENABLED) return null;

  return {
    enabled: true,
    baseUrl: env.WEATHER_API_BASE_URL,
    httpTimeoutMs: env.WEATHER_HTTP_TIMEOUT_MS,
    cacheTtlSeconds: env.WEATHER_CACHE_TTL_SECONDS,
  };
}
