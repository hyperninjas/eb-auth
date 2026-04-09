import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { runWithRequestContext } from "../infra/request-context";

const HEADER = "x-request-id";

/**
 * Assigns a request id (honoring an inbound `x-request-id` header) and
 * runs the rest of the request inside an AsyncLocalStorage scope so any
 * downstream code — including `getLogger()` — sees the same id.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header(HEADER);
  const requestId = inbound && inbound.length > 0 && inbound.length <= 128 ? inbound : randomUUID();

  res.setHeader(HEADER, requestId);

  runWithRequestContext({ requestId }, () => {
    next();
  });
}
