import { z } from "zod";

/**
 * EPC module configuration.
 *
 * Follows the same module-local config pattern as `shop.config.ts`:
 * env vars live here (not in `src/config/env.ts`), so the module is
 * fully detachable — drop the folder and zero core files change.
 *
 * The EPC Open Data Communities API uses HTTP Basic Auth (email:apiKey).
 * Credentials stay server-side; the Flutter app never sees them.
 */

const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const EpcEnvSchema = z.object({
  // Master switch. Set to "true" to mount /api/epc/* routes.
  EPC_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // HTTP Basic Auth credentials for the EPC Open Data Communities API.
  // Register at https://epc.opendatacommunities.org/ to obtain these.
  EPC_API_EMAIL: z.preprocess(blankAsUndefined, z.string().email().optional()),
  EPC_API_KEY: z.preprocess(blankAsUndefined, z.string().min(1).optional()),

  // Base URL of the EPC API. Defaults to the production endpoint.
  EPC_API_BASE_URL: z.preprocess(
    blankAsUndefined,
    z.url().default("https://epc.opendatacommunities.org/api/v1"),
  ),

  // Outbound HTTP timeout. The EPC API can be slow under load.
  EPC_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // Redis cache TTL for search results and certificates. EPC data
  // changes rarely (certificates valid 10 years), so 24h is safe.
  EPC_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
});

export interface EpcConfig {
  enabled: boolean;
  apiEmail: string;
  apiKey: string;
  baseUrl: string;
  httpTimeoutMs: number;
  cacheTtlSeconds: number;
}

/**
 * Parse EPC env vars. Returns `null` when the module is disabled,
 * allowing `createEpcModule()` to skip activation cleanly.
 */
export function loadEpcConfig(): EpcConfig | null {
  const parsed = EpcEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`EPC env validation failed: ${JSON.stringify(z.treeifyError(parsed.error))}`);
  }
  const env = parsed.data;
  if (!env.EPC_ENABLED) return null;

  const missing: string[] = [];
  if (!env.EPC_API_EMAIL) missing.push("EPC_API_EMAIL");
  if (!env.EPC_API_KEY) missing.push("EPC_API_KEY");
  if (missing.length > 0) {
    throw new Error(
      `EPC_ENABLED=true but the following env vars are missing: ${missing.join(", ")}. ` +
        `Either set them, or set EPC_ENABLED=false to disable the EPC module.`,
    );
  }

  return {
    enabled: true,
    apiEmail: env.EPC_API_EMAIL!,
    apiKey: env.EPC_API_KEY!,
    baseUrl: env.EPC_API_BASE_URL,
    httpTimeoutMs: env.EPC_HTTP_TIMEOUT_MS,
    cacheTtlSeconds: env.EPC_CACHE_TTL_SECONDS,
  };
}
