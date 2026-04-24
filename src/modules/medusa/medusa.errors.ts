import { DomainError } from "../../errors/domain";
import { type AppError, serviceUnavailable } from "../../errors/app-error";

/**
 * Medusa module domain errors.
 *
 * The provisioning logic only needs ONE domain error: provisioning failed.
 * All other commerce errors (if any arise later) would be surfaced directly
 * from Medusa or mapped at the point of use.
 *
 * The DomainError → AppError mapping lives HERE in the module folder,
 * not in the central error handler. This allows third-party integrations
 * to ship their own HTTP semantics without ever touching
 * `src/middleware/error-handler.ts`. Delete the medusa folder and the
 * central error handler is unaffected.
 */

export class MedusaProvisioningError extends DomainError {
  readonly kind = "MedusaProvisioningError" as const;
  constructor(
    public readonly userId: string,
    public readonly upstreamCause?: unknown,
  ) {
    super(`Failed to provision Medusa customer for user ${userId}.`);
  }
}

export function mapMedusaDomainError(err: unknown): AppError | undefined {
  if (err instanceof MedusaProvisioningError) {
    // 503 with a generic message: the user can retry, the upstream cause
    // is logged centrally with the request id so support can correlate
    // without leaking infrastructure details.
    return serviceUnavailable("Could not set up account. Please try again.");
  }
  return undefined;
}
