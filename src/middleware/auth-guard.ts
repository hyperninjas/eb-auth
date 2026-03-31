import type { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { logger } from "../logger.js";

/**
 * Express middleware that rejects unauthenticated requests.
 * Attaches `req.session` and `req.user` for downstream handlers.
 */
export async function authGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized." });
      return;
    }

    req.session = session.session;
    req.user = session.user;
    next();
  } catch (err) {
    logger.error(err, "Auth guard failed");
    res.status(503).json({ status: 503, code: "AUTH_UNAVAILABLE", message: "Authentication service temporarily unavailable." });
  }
}
