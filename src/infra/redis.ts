import { Redis, type RedisOptions } from "ioredis";
import { env, isProduction } from "../config/env";
import { logger } from "./logger";

/**
 * Single Redis client for the whole process.
 *
 * Used for:
 *   1. Distributed rate limiting (rate-limit-redis store) — required for
 *      correct per-IP limits when running >1 replica.
 *   2. Better Auth secondary storage — caches session lookups so
 *      `auth.api.getSession()` is O(1) Redis instead of a Postgres query
 *      on every authenticated request.
 *
 * ── Why ioredis (and not node-redis)? ────────────────────────────────────
 * As of April 2026, the Redis team officially recommends `node-redis` v5+
 * for new projects — node-redis is the actively maintained client and has
 * first-class support for Redis 8 features. **However**, our Better Auth
 * integration requires ioredis: `@better-auth/redis-storage` peer-deps
 * `ioredis: ^5.0.0` and accepts no other client. Switching would mean
 * re-implementing Better Auth's `secondaryStorage` adapter by hand, which
 * isn't worth it. ioredis remains stable and Redis-8 compatible for the
 * standard commands we use here.
 *
 * In dev, tsx may re-evaluate this module on watch restart, so we cache
 * the client on globalThis to avoid leaking connections between reloads.
 */

const globalForRedis = globalThis as unknown as {
  __redis?: Redis;
};

function createRedisClient(): Redis {
  const options: RedisOptions = {
    // Lazy-connect false so we fail fast at boot if Redis is unreachable
    // (the bootstrap calls `redis.ping()` before listening — see server.ts).
    lazyConnect: false,

    // Limit retries on a single command — prevents a flapping Redis from
    // making request latency unbounded. Failed commands surface as errors
    // and the rate limiter / Better Auth fall back to fail-open behavior.
    maxRetriesPerRequest: 3,

    // Reconnect on READONLY errors (Redis Cluster failover scenario).
    reconnectOnError: (err) => err.message.includes("READONLY"),

    // Sensible connection timeout — fail fast at boot if Redis is down.
    connectTimeout: 5_000,

    // Tag commands so they're identifiable in `redis-cli CLIENT LIST`.
    connectionName: "eb-auth",

    // Cap reconnect backoff so a long Redis outage doesn't accumulate
    // increasingly-spaced retry attempts. ioredis defaults grow forever.
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  };

  const client = new Redis(env.REDIS_URL, options);

  // ── Logging ─────────────────────────────────────────────────────────
  // Many ioredis errors arrive with an empty `.message` (e.g. ECONNREFUSED
  // surfaces as `Error` with empty message but `.code = "ECONNREFUSED"`).
  // Log the whole error object so the cause is actually visible — pino
  // serialises Error instances structurally via its built-in `err`
  // serializer.
  client.on("error", (err: Error & { code?: string; syscall?: string }) => {
    logger.error(
      {
        err,
        code: err.code,
        syscall: err.syscall,
        message: err.message || "(empty)",
      },
      "[redis] connection error",
    );
  });

  client.on("connect", () => {
    logger.info({ url: redactedUrl(env.REDIS_URL) }, "[redis] connected");
  });

  client.on("ready", () => {
    logger.info("[redis] ready");
  });

  client.on("close", () => {
    logger.warn("[redis] connection closed");
  });

  client.on("reconnecting", (delay: number) => {
    logger.warn({ delay }, "[redis] reconnecting");
  });

  client.on("end", () => {
    logger.warn("[redis] connection ended (no further reconnects)");
  });

  return client;
}

/**
 * Strips credentials from a Redis URL so the connection log line is safe
 * to ship to a log aggregator.
 *
 *   redis://user:pass@host:6379  →  redis://host:6379
 */
function redactedUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return "(unparseable)";
  }
}

export const redis: Redis = globalForRedis.__redis ?? createRedisClient();

if (!isProduction) {
  globalForRedis.__redis = redis;
}
