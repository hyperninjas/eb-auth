import { Router } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import { authLimiter } from "../../middleware/rate-limit";

/**
 * Better Auth HTTP router.
 *
 * Mounted in `src/modules/index.ts` at `/api/auth` with `rawBody: true`,
 * so it sits BEFORE the body parsers in `createApp()` — Better Auth's
 * Node handler reads the raw request stream itself and would fail if
 * `express.json()` had already consumed it.
 *
 * The catch-all `/*splat` forwards every request under `/api/auth/*` to
 * Better Auth (sign-in, sign-up, sessions, OAuth callbacks, OpenAPI
 * reference at `/api/auth/reference`, etc.).
 *
 * `authLimiter` is the Redis-backed brute-force protection layer; Better
 * Auth's own internal rate limiter runs on top of it for finer-grained
 * per-action limits.
 */
const router: Router = Router();

router.use(authLimiter);
router.all("/*splat", toNodeHandler(auth));

export { router as authRouter };
