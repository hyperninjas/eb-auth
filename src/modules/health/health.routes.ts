import { Router, type Request, type Response } from "express";
import { prisma } from "../../infra/prisma";
import { redis } from "../../infra/redis";
import { isShuttingDown } from "../../middleware/drain";

const router: Router = Router();

/**
 * Liveness — process is up. Cheap, no dependencies. Used by k8s to decide
 * "is this pod alive at all?" — answering 503 here gets the pod restarted.
 */
router.get("/livez", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

/**
 * Readiness — process can accept traffic. Checks all hard dependencies
 * (Postgres, Redis) and the drain flag. Used by k8s/the LB to decide
 * "should I send new requests here?" — answering 503 here gets the pod
 * removed from the load balancer pool but does NOT restart it.
 */
router.get("/readyz", async (_req: Request, res: Response) => {
  if (isShuttingDown()) {
    res.status(503).json({ status: "shutting_down" });
    return;
  }

  const checks = {
    db: false,
    redis: false,
  };

  // Run both checks in parallel — keeps probe latency low.
  const [dbResult, redisResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);
  checks.db = dbResult.status === "fulfilled";
  checks.redis = redisResult.status === "fulfilled";

  const ready = checks.db && checks.redis;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "degraded",
    checks,
  });
});

/**
 * Back-compat alias for the previous /health endpoint. Prefer /livez or
 * /readyz in new tooling.
 */
router.get("/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
});

export { router as healthRouter };
