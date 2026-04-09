import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async route handler so unhandled rejections are forwarded to
 * Express's error pipeline instead of being silently dropped.
 *
 * Non-Error throws are normalised into real `Error` instances before being
 * passed to `next()`. Without this, throwing a string or plain object from
 * a controller would crash the central error handler when it tries to
 * read `err.message`.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch((err: unknown) => {
      next(err instanceof Error ? err : new Error(String(err)));
    });
  };
}
