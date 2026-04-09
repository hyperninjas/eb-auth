import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../modules/auth/auth";
import { unauthorized, serviceUnavailable } from "../errors/app-error";
import { ERROR_CODES } from "../http/openapi-shared";
import { getLogger } from "../infra/logger";
import { setUserId } from "../infra/request-context";

/**
 * Rejects unauthenticated requests. Attaches `req.session` / `req.user`
 * for downstream handlers and tags the request context with the user id
 * so subsequent log lines carry it automatically.
 *
 * Errors are THROWN to `next(err)` so the central error handler formats
 * them — there are no `res.status().json()` calls here. That guarantees
 * 401 / 503 from this middleware look identical to the same statuses
 * produced anywhere else in the app.
 */
export async function authGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      next(unauthorized());
      return;
    }

    req.session = session.session;
    req.user = session.user;
    setUserId(session.user.id);
    next();
  } catch (err) {
    getLogger().error(err, "Auth guard failed");
    next(
      serviceUnavailable(
        "Authentication service temporarily unavailable.",
        ERROR_CODES.AUTH_UNAVAILABLE,
      ),
    );
  }
}
