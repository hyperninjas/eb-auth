import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  // CORS — comma-separated list of allowed origins. Single origin still
  // works ("https://app.example.com"); multiple origins use a comma:
  // "https://app.example.com,https://admin.example.com".
  CORS_ORIGIN: z.string().min(1),

  // Better Auth signs sessions with this secret. 32 bytes minimum so a
  // dev-grade secret can never accidentally ship to prod.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters."),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),

  // Postgres connection string. In prod, point this at PgBouncer (not
  // Postgres directly) so per-pod pools don't exhaust max_connections.
  DATABASE_URL: z.string().min(1),

  // Per-pod Prisma connection pool. Total pool across the cluster is
  // DB_POOL_MAX × replicas — keep it small (5–10) and put PgBouncer in
  // front for >5 replicas.
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis is required: distributed rate-limiting + Better Auth session
  // secondary storage. Use a managed Redis (Upstash, ElastiCache) in prod.
  REDIS_URL: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),

  // Number of reverse-proxy hops to trust for IP/protocol headers. Set
  // to 1 behind a single LB, higher behind Cloudflare → ALB → app, etc.
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(1),

  // Hard cap on graceful shutdown — after this many ms we force-exit.
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),

  // Outbound HTTP timeout for OAuth provider calls (Google etc.). Keeps
  // a slow upstream from piling up requests against us.
  OUTBOUND_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

// Refuse to boot unless the process is running in UTC. Every timestamp
// the app produces — Prisma writes, pino log lines, error stacks, OAuth
// state expiry — must be UTC, and the simplest way to enforce that is
// to fail fast at startup if `TZ` (or the host clock) drifted. Running
// half the fleet in UTC and half in `America/Los_Angeles` is the kind
// of bug you only notice three months later when a daily report is
// missing 7 hours of rows.
//
// Both checks matter: `process.env.TZ` is what was *requested*; the
// Intl resolved value is what the runtime is *actually* using. They can
// disagree if `TZ` was set after `Date` was first touched, or if the
// container image bakes a different /etc/localtime.
{
  const requestedTz = process.env["TZ"];
  const resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzIsUtc = requestedTz === "UTC" && resolvedTz === "UTC";
  if (!tzIsUtc) {
    const message =
      `Process timezone is not UTC ` +
      `(TZ=${requestedTz ?? "(unset)"}, ` +
      `Intl resolved=${resolvedTz}). ` +
      `Set TZ=UTC in the container/host environment.`;
    if (isProduction) {
      // Fail closed in prod. Running pods in mixed zones silently shifts
      // every Date the app produces and is one of those bugs you find
      // weeks later in a daily report.
      console.error(message);
      process.exit(1);
    } else {
      // Warn loudly in dev/test so the developer notices but `pnpm dev`
      // still works on a laptop set to local time.
      console.warn(`[env] ${message}`);
    }
  }
}
