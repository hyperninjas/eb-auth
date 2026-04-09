import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env, isProduction } from "../config/env";
import { logger } from "./logger";

/**
 * Single PrismaClient instance for the whole process.
 *
 * Prisma 7 mandates a driver adapter — the query engine no longer ships
 * with the client. We use @prisma/adapter-pg, which wraps node-postgres
 * and gives us a real connection pool we can tune for the workload.
 *
 * In dev, tsx may re-evaluate the module on watch restart, so we cache
 * on globalThis to avoid leaking connections between reloads.
 */

const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  // Per-pod connection pool. Total connections across the cluster is
  // DB_POOL_MAX × replicas — keep this small (5–10) and put PgBouncer
  // in front for >5 replicas, otherwise Postgres's max_connections will
  // be exhausted.
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  const client = new PrismaClient({
    adapter,
    log: isProduction
      ? [{ emit: "event", level: "error" }]
      : [
          { emit: "event", level: "error" },
          { emit: "event", level: "warn" },
          { emit: "event", level: "query" },
        ],
  });

  // Bridge Prisma's structured log events into pino.
  interface LogEvent {
    target: string;
    message: string;
  }
  interface QueryEvent {
    duration: number;
    query: string;
    params: string;
  }

  client.$on("error" as never, (e: LogEvent) => {
    logger.error({ target: e.target, msg: e.message }, "[prisma] error");
  });

  if (!isProduction) {
    client.$on("warn" as never, (e: LogEvent) => {
      logger.warn({ target: e.target, msg: e.message }, "[prisma] warn");
    });
    client.$on("query" as never, (e: QueryEvent) => {
      logger.debug({ duration: e.duration, query: e.query, params: e.params }, "[prisma] query");
    });
  }

  return client;
}

export const prisma: PrismaClient = globalForPrisma.__prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.__prisma = prisma;
}
