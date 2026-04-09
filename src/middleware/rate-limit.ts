import rateLimit from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { redis } from "../infra/redis";

/**
 * Distributed rate limiters backed by Redis.
 *
 * Why Redis instead of the default in-memory store: with >1 replica, an
 * in-memory limiter gives each pod its own counter — a 100/15min limit
 * effectively becomes `100 × N`. Redis-backed counters are shared across
 * the whole cluster, so the limit is enforced correctly regardless of
 * which pod a request lands on.
 *
 * Each limiter uses a distinct key prefix so global and auth limits don't
 * collide in Redis.
 */

// Helper: shared store factory so prefix and client stay in sync.
// rate-limit-redis was originally written for node-redis, where commands
// are sent via `client.sendCommand(args)`. ioredis uses `client.call(cmd,
// ...args)` instead, so we shim it via a variadic wrapper and cast the
// return type to the union rate-limit-redis expects.
function makeStore(prefix: string): RedisStore {
  return new RedisStore({
    sendCommand: async (...args: string[]): Promise<RedisReply> => {
      return (await redis.call(args[0]!, ...args.slice(1))) as RedisReply;
    },
    prefix,
  });
}

// `passOnStoreError: true` makes the limiter FAIL OPEN if Redis is
// unreachable: requests are allowed through and the failure is logged
// to the express-rate-limit "errorHandler". Without this flag a Redis
// outage takes the entire app offline because every request bounces off
// the limiter with a 500 before reaching its handler. Failing open is
// the correct tradeoff for a rate limiter — Better Auth still has its
// own internal limiter, and the upstream LB / WAF should have its own
// blanket abuse protection independent of this counter.
const FAIL_OPEN: { passOnStoreError: true } = { passOnStoreError: true };

/**
 * Global per-IP limiter — cheap blanket protection for every route.
 * Tuned for normal traffic; tighten if abuse is observed.
 */
export const globalLimiter = rateLimit({
  ...FAIL_OPEN,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  store: makeStore("rl:global:"),
});

/**
 * Tighter limiter for /api/auth — credential brute-force mitigation.
 * Better Auth has its own internal limiter on top of this; both run.
 */
export const authLimiter = rateLimit({
  ...FAIL_OPEN,
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts, please try again later.",
  },
  store: makeStore("rl:auth:"),
});
