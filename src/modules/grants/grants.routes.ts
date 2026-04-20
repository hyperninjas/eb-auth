/**
 * Express router for the grants module.
 *
 * All routes require authentication.
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { validate } from "../../middleware/validate";
import { updateGrantProfileSchema } from "./grants.schema";

/** Async route handler compatible with asyncHandler(). */
type RouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export interface GrantsController {
  getProfile: RouteHandler;
  updateProfile: RouteHandler;
  checkEligibility: RouteHandler;
}

export function createGrantsRouter(controller: GrantsController): Router {
  const router = Router();

  // Every grants route requires an authenticated user
  router.use(authGuard);

  // ── Grant Profile Management ───────────────────────────────────────

  router.get("/profile", asyncHandler(controller.getProfile));

  router.patch(
    "/profile",
    validate({ body: updateGrantProfileSchema }),
    asyncHandler(controller.updateProfile),
  );

  // ── Grant Eligibility Checking ─────────────────────────────────────

  router.get("/eligibility", asyncHandler(controller.checkEligibility));

  return router;
}
