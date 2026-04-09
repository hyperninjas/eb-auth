import { z } from "zod";

/**
 * Shared OpenAPI components used by every module.
 *
 * Defining them here once means:
 *   - The error response shape lives in EXACTLY one place. The error
 *     handler returns a value that satisfies `ErrorResponse`, and every
 *     module's openapi imports `errorResponseSchema` instead of redefining
 *     its own copy.
 *   - The pagination envelope is consistent across modules — no module
 *     can accidentally invent its own field names.
 *
 * Bumping any of these is a single edit that propagates to the OpenAPI
 * document and the runtime types automatically.
 */

// ── Error codes ──────────────────────────────────────────────────────────
//
// The full set of machine-readable error codes the API can return. Defined
// as a const object so:
//   1. `ErrorCode` is a closed string-literal union — typos at the call
//      site become typecheck errors.
//   2. `errorResponseSchema.code` is a `z.enum(...)` over the same values,
//      so the OpenAPI document publishes the exact set and SDK generators
//      can produce a typed enum on the client side.
//   3. There's exactly one place to add a new code.

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  AUTH_UNAVAILABLE: "AUTH_UNAVAILABLE",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// z.enum needs a non-empty tuple. Cast through `as` because Object.values
// returns string[] but we know statically these are ErrorCode literals.
const errorCodeValues = Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

// ── Error response ────────────────────────────────────────────────────────

export const fieldErrorSchema = z
  .object({
    field: z.string(),
    message: z.string(),
  })
  .meta({ id: "FieldError" });

export const errorResponseSchema = z
  .object({
    status: z.number().int(),
    code: z.enum(errorCodeValues),
    message: z.string(),
    // Always present in HTTP context (set by request-context middleware),
    // optional only because `getRequestId()` returns undefined outside a
    // request scope. Clients can rely on it being present.
    requestId: z.string().optional(),
    details: z.array(fieldErrorSchema).optional(),
  })
  .meta({ id: "ErrorResponse" });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type FieldError = z.infer<typeof fieldErrorSchema>;

// ── Pagination envelope ───────────────────────────────────────────────────

export const paginationSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: "Pagination" });

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Generic paginated response builder. Each module reuses this so the
 * envelope is identical everywhere — only the `data` schema changes.
 *
 *   const DeviceListResponseSchema = paginatedResponse(deviceDTOSchema)
 *     .meta({ id: "DeviceListResponse" });
 */
export function paginatedResponse<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: paginationSchema,
  });
}
