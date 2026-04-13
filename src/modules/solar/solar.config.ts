import { z } from "zod";

/**
 * Solar module configuration.
 *
 * Proxies requests to the Quartz Solar API (free, no auth).
 * Module-local config pattern — env vars stay here, not in src/config/env.ts.
 */

const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const SolarEnvSchema = z.object({
  // Master switch. Set to "true" to mount /api/solar/* routes.
  SOLAR_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Quartz Solar API base URL. Defaults to production endpoint.
  SOLAR_API_BASE_URL: z.preprocess(blankAsUndefined, z.url().default("https://open.quartz.solar")),

  // Outbound HTTP timeout for Quartz Solar API (ms).
  // Quartz can be slow; use a reasonable timeout.
  SOLAR_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  // Redis cache TTL for solar forecasts (seconds).
  // Solar forecasts depend on weather models that update every 6-12h.
  // 6h balances freshness with performance (Quartz API can be slow).
  SOLAR_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(21_600),
});

export interface SolarConfig {
  enabled: boolean;
  baseUrl: string;
  httpTimeoutMs: number;
  cacheTtlSeconds: number;
}

/**
 * Parse solar env vars. Returns `null` when the module is disabled,
 * allowing `createSolarModule()` to skip activation cleanly.
 */
export function loadSolarConfig(): SolarConfig | null {
  const parsed = SolarEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Solar env validation failed: ${JSON.stringify(z.treeifyError(parsed.error))}`);
  }
  const env = parsed.data;
  if (!env.SOLAR_ENABLED) return null;

  return {
    enabled: true,
    baseUrl: env.SOLAR_API_BASE_URL,
    httpTimeoutMs: env.SOLAR_HTTP_TIMEOUT_MS,
    cacheTtlSeconds: env.SOLAR_CACHE_TTL_SECONDS,
  };
}
