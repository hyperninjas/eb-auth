import { z } from "zod";

/**
 * Medusa integration configuration.
 *
 * Module-local env validation — not in src/config/env.ts. This keeps the
 * integration completely detachable: removing the folder removes the env
 * vars too (no orphaned keys in the core config).
 *
 * When MEDUSA_ENABLED=true, every dependent var becomes required. Failing
 * fast at boot is better than discovering mid-signup that MEDUSA_ADMIN_TOKEN
 * was never set.
 */

const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const MedusaEnvSchema = z.object({
  // Master switch. Set to "true" to enable Medusa customer provisioning.
  // Defaults to disabled so a fresh checkout never syncs to Medusa unless
  // explicitly opted in.
  MEDUSA_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Internal URL of the Medusa service. In docker-compose this resolves
  // to the service name; in production point at the internal LB.
  // Browsers NEVER hit this URL directly.
  MEDUSA_URL: z.preprocess(blankAsUndefined, z.url().optional()),

  // Admin API token for server-to-server calls. Generated in Medusa admin
  // dashboard (Settings → Developer → Secret API Keys → "Create API Key"
  // with type=secret). Used for /admin/customers calls.
  MEDUSA_ADMIN_TOKEN: z.preprocess(blankAsUndefined, z.string().min(1).optional()),

  // Outbound HTTP timeout for calls into Medusa. Keeps a slow upstream
  // from piling up requests against us.
  MEDUSA_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
});

export interface MedusaConfig {
  enabled: boolean;
  medusaUrl: string;
  adminToken: string;
  httpTimeoutMs: number;
}

/**
 * Parse medusa env vars and return a fully-validated config, or `null` if
 * the integration is disabled. Returning null (instead of throwing) lets
 * `createMedusaModule()` skip activation cleanly when the deployment isn't
 * using medusa.
 *
 * When `MEDUSA_ENABLED=true`, every dependent var becomes required and
 * we throw a descriptive error listing what's missing.
 */
export function loadMedusaConfig(): MedusaConfig | null {
  const parsed = MedusaEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Medusa env validation failed: ${JSON.stringify(z.treeifyError(parsed.error))}`,
    );
  }
  const env = parsed.data;
  if (!env.MEDUSA_ENABLED) return null;

  // When enabled, every dependent var must be present. Collect all missing
  // keys at once so devs get a complete error message instead of fixing
  // one var at a time.
  const missing: string[] = [];
  if (!env.MEDUSA_URL) missing.push("MEDUSA_URL");
  if (!env.MEDUSA_ADMIN_TOKEN) missing.push("MEDUSA_ADMIN_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `MEDUSA_ENABLED=true but the following env vars are missing: ${missing.join(", ")}. ` +
        `Either set them, or set MEDUSA_ENABLED=false to disable the medusa module.`,
    );
  }

  return {
    enabled: true,
    medusaUrl: env.MEDUSA_URL!,
    adminToken: env.MEDUSA_ADMIN_TOKEN!,
    httpTimeoutMs: env.MEDUSA_HTTP_TIMEOUT_MS,
  };
}
