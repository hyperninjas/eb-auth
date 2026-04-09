import { createApp } from "./app";
import { env } from "../config/env";
import { logger } from "../infra/logger";
import { prisma } from "../infra/prisma";
import { redis } from "../infra/redis";
import { startDraining } from "../middleware/drain";

/**
 * Production entrypoint. Boots the Express app, wires graceful shutdown,
 * and surfaces unhandled rejections / uncaught exceptions to the logger.
 *
 * Shutdown sequence on SIGTERM/SIGINT:
 *   1. Mark the process as draining → /readyz returns 503 → LB pulls us
 *      out of rotation, drainMiddleware 503s any new in-flight requests.
 *   2. Stop the HTTP server from accepting new connections + wait for
 *      in-flight requests to finish (up to SHUTDOWN_TIMEOUT_MS).
 *   3. Disconnect from Postgres and Redis cleanly.
 *   4. Exit 0. If any step hangs past the timeout, force-exit 1.
 */
async function bootstrap(): Promise<void> {
  // Set the process title so it's findable in `ps`, `top`, k8s metrics.
  process.title = "eb-auth";

  // Verify hard dependencies BEFORE listening so a broken DB/Redis fails
  // fast at boot instead of returning 500s to the first request.
  await prisma.$connect();
  await redis.ping();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, `Server listening on :${env.PORT}`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`${signal} received — draining`);

    // Step 1: flip the drain flag so probes 503 and new requests get
    // a clean shutdown response.
    startDraining();

    // Hard timeout — never let a hung handler block shutdown forever.
    const force = setTimeout(() => {
      logger.error("Shutdown timeout exceeded — forcing exit");
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    force.unref();

    // Step 2: close the HTTP server. The callback fires once all
    // existing connections have drained.
    server.close((err) => {
      if (err) logger.error(err, "Error while closing HTTP server");
      else logger.info("HTTP server closed");
    });

    // Step 3: disconnect runtime deps in parallel.
    await Promise.allSettled([
      prisma.$disconnect().then(
        () => logger.info("Prisma disconnected"),
        (err: unknown) => logger.error(err, "Error disconnecting Prisma"),
      ),
      redis.quit().then(
        () => logger.info("Redis disconnected"),
        (err: unknown) => logger.error(err, "Error disconnecting Redis"),
      ),
    ]);

    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Last-resort safety nets. These should never fire in healthy code —
  // they exist to make sure crashes are *visible* in the log aggregator
  // before the container restarts.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal(err, "Uncaught exception");
    process.exit(1);
  });
}

bootstrap().catch((err: unknown) => {
  logger.fatal(err, "Bootstrap failed — server not started");
  process.exit(1);
});
