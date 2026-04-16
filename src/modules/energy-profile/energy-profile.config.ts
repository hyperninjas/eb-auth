import { z } from "zod";

/**
 * Energy-profile module configuration.
 *
 * Module-local env validation — nothing is added to `src/config/env.ts`.
 * Follows the same pattern as `epc.config.ts` and `shop.config.ts`.
 */

const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const EnergyProfileEnvSchema = z.object({
  // Master switch. Set to "true" to mount /api/energy-profile/* routes.
  ENERGY_PROFILE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Octopus Energy API — public, no auth required
  OCTOPUS_API_BASE_URL: z.preprocess(
    blankAsUndefined,
    z.url().default("https://api.octopus.energy/v1"),
  ),
  OCTOPUS_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  // EU JRC PVGIS API — public, no auth required
  PVGIS_API_BASE_URL: z.preprocess(
    blankAsUndefined,
    z.url().default("https://re.jrc.ec.europa.eu/api/v5_3"),
  ),
  PVGIS_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Redis cache TTL for user property profiles (1 year default).
  // EPC data changes ~once per 10 years; users can force-refresh.
  EP_PROFILE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(31_536_000),

  // Redis cache TTL for computed forecast results (24 hours default).
  EP_FORECAST_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
});

export interface EnergyProfileConfig {
  enabled: boolean;
  octopusBaseUrl: string;
  octopusTimeoutMs: number;
  pvgisBaseUrl: string;
  pvgisTimeoutMs: number;
  profileCacheTtlSeconds: number;
  forecastCacheTtlSeconds: number;
}

/**
 * Parse energy-profile env vars. Returns `null` when the module is
 * disabled, allowing `createEnergyProfileModule()` to skip activation.
 */
export function loadEnergyProfileConfig(): EnergyProfileConfig | null {
  const parsed = EnergyProfileEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Energy-profile env validation failed: ${JSON.stringify(z.treeifyError(parsed.error))}`,
    );
  }
  const env = parsed.data;
  if (!env.ENERGY_PROFILE_ENABLED) return null;

  return {
    enabled: true,
    octopusBaseUrl: env.OCTOPUS_API_BASE_URL,
    octopusTimeoutMs: env.OCTOPUS_HTTP_TIMEOUT_MS,
    pvgisBaseUrl: env.PVGIS_API_BASE_URL,
    pvgisTimeoutMs: env.PVGIS_HTTP_TIMEOUT_MS,
    profileCacheTtlSeconds: env.EP_PROFILE_CACHE_TTL_SECONDS,
    forecastCacheTtlSeconds: env.EP_FORECAST_CACHE_TTL_SECONDS,
  };
}
