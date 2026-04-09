import { z } from "zod";

/**
 * Shop module configuration.
 *
 * This module is the canonical "third-party integration" pattern: every
 * external system we plug in (Medusa here, but later: notification
 * providers, search, analytics, ...) follows the same shape — its own
 * env validation, its own client, its own errors, its own registration.
 *
 * Why a module-local config instead of adding to `src/config/env.ts`:
 *   1. Detachability. Removing the integration must not require editing
 *      a core file. `env.ts` is core; this file is module-local. Drop the
 *      `src/modules/shop/` folder and zero core files change.
 *   2. Lazy validation. We only parse these vars when the module actually
 *      activates (via `createShopModule()`), so a deployment that doesn't
 *      need shop never has to set them.
 *   3. Locality. Reading these env vars from anywhere outside this module
 *      is a violation of the module-boundary rule (CLAUDE.md hard rule #3).
 */

// Treat empty strings as "not set". A `.env` file commonly has
// `MEDUSA_ADMIN_TOKEN=` with no value when the integration is
// disabled — that's an empty string in `process.env`, not undefined,
// so naive `.min(1).optional()` would reject it. Preprocessing to
// undefined makes the optional/required distinction work as expected.
const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const ShopEnvSchema = z.object({
  // Master switch. Set to "true" to mount the /shop/* routes and start
  // talking to Medusa. Defaults to disabled so a fresh checkout never
  // hits Medusa unless explicitly opted in.
  SHOP_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Internal URL of the Medusa service. In docker-compose this resolves
  // to the service name (`http://medusa:9000`); in production point at
  // the internal LB. Browsers NEVER hit this URL directly.
  MEDUSA_URL: z.preprocess(blankAsUndefined, z.url().optional()),

  // Static admin API token, generated via the Medusa admin dashboard
  // (Settings → Developer → Secret API Keys → "Create API Key" with
  // type=secret). Used for server-to-server admin calls — creating
  // customers, listing orders, etc.
  MEDUSA_ADMIN_TOKEN: z.preprocess(blankAsUndefined, z.string().min(1).optional()),

  // Publishable key bound to a sales channel. Required header on every
  // /store/* call (`x-publishable-api-key`). Created in the admin
  // dashboard under Settings → Publishable API Keys.
  MEDUSA_PUBLISHABLE_KEY: z.preprocess(blankAsUndefined, z.string().min(1).optional()),

  // Shared HMAC secret for the Medusa → Express webhook callback path
  // (subscribers in the Medusa repo POST event payloads to our
  // /internal/commerce/events endpoint signed with this secret).
  MEDUSA_WEBHOOK_SECRET: z.preprocess(blankAsUndefined, z.string().min(16).optional()),

  // Outbound HTTP timeout for calls into Medusa. Keeps a slow upstream
  // from piling up requests against us.
  MEDUSA_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
});

export interface ShopConfig {
  enabled: boolean;
  medusaUrl: string;
  adminToken: string;
  publishableKey: string;
  webhookSecret: string;
  httpTimeoutMs: number;
}

/**
 * Parse shop env vars and return a fully-validated config, or `null` if
 * the integration is disabled. Returning null (instead of throwing) lets
 * `createShopModule()` skip activation cleanly when the deployment isn't
 * using shop — no exceptions, no module mounted.
 *
 * When `SHOP_ENABLED=true`, every dependent var becomes required and
 * we throw a descriptive error listing what's missing. Failing fast at
 * boot is far better than discovering mid-checkout that MEDUSA_ADMIN_TOKEN
 * was never set.
 */
export function loadShopConfig(): ShopConfig | null {
  const parsed = ShopEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Shop env validation failed: ${JSON.stringify(z.treeifyError(parsed.error))}`);
  }
  const env = parsed.data;
  if (!env.SHOP_ENABLED) return null;

  // When enabled, every dependent var must be present. We collect all
  // missing keys at once instead of failing on the first one — devs
  // setting up shop for the first time get a single complete error
  // message instead of fixing one var at a time.
  const missing: string[] = [];
  if (!env.MEDUSA_URL) missing.push("MEDUSA_URL");
  if (!env.MEDUSA_ADMIN_TOKEN) missing.push("MEDUSA_ADMIN_TOKEN");
  if (!env.MEDUSA_PUBLISHABLE_KEY) missing.push("MEDUSA_PUBLISHABLE_KEY");
  if (!env.MEDUSA_WEBHOOK_SECRET) missing.push("MEDUSA_WEBHOOK_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `SHOP_ENABLED=true but the following env vars are missing: ${missing.join(", ")}. ` +
        `Either set them, or set SHOP_ENABLED=false to disable the shop module.`,
    );
  }

  return {
    enabled: true,
    medusaUrl: env.MEDUSA_URL!,
    adminToken: env.MEDUSA_ADMIN_TOKEN!,
    publishableKey: env.MEDUSA_PUBLISHABLE_KEY!,
    webhookSecret: env.MEDUSA_WEBHOOK_SECRET!,
    httpTimeoutMs: env.MEDUSA_HTTP_TIMEOUT_MS,
  };
}
