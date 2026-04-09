import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodType } from "zod";

/**
 * Per-request validated payload, populated by the `validate()` middleware.
 * Strongly typed via the route's specific schema using a generic helper.
 */
export interface ValidatedRequest<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
> extends Request {
  validated: {
    body: TBody;
    query: TQuery;
    params: TParams;
  };
}

interface ValidateOptions {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Express middleware factory that parses request body / query / params with
 * Zod and attaches the parsed result to `req.validated`. Validation errors
 * are forwarded to the error handler so they get the standard JSON shape.
 *
 * Why a middleware instead of `schema.parse()` inside each controller:
 *   - Centralizes validation in one place (no copy-paste per route).
 *   - Lets the OpenAPI generator and the runtime parser share the same
 *     schema (single source of truth).
 *   - Strips unknown keys + applies defaults BEFORE the controller runs,
 *     so business logic always sees a clean, typed value.
 *
 * Usage:
 *
 *   router.post(
 *     "/",
 *     validate({ body: createDeviceSchema }),
 *     devicesController.create,
 *   );
 *
 *   // inside the controller:
 *   const body = (req as ValidatedRequest<CreateDeviceInput>).validated.body;
 */
export function validate(opts: ValidateOptions): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const validated: Record<string, unknown> = {};

      if (opts.body) validated["body"] = opts.body.parse(req.body);
      if (opts.query) validated["query"] = opts.query.parse(req.query);
      if (opts.params) validated["params"] = opts.params.parse(req.params);

      // Attach as a single, typed sub-object so controllers don't have to
      // know which fields were validated.
      (req as Request & { validated: typeof validated }).validated = validated;
      next();
    } catch (err) {
      // Zod errors land here; the global error handler maps them to a
      // 400 with structured field-level details.
      next(err);
    }
  };
}
