import { DomainError } from "../../errors/domain";
import { type AppError, serviceUnavailable } from "../../errors/app-error";

/**
 * Shop module domain errors.
 *
 * The slim proxy design only needs ONE domain error: provisioning
 * failed. Every other commerce error is surfaced verbatim from Medusa
 * by the proxy (after a thin envelope rewrite — see shop.proxy.ts), so
 * the rest of the module never needs to model upstream failures as
 * typed exceptions.
 *
 * The DomainError → AppError mapping lives HERE in the module folder,
 * not in the central error handler. The shop module's `index.ts`
 * exports `mapShopDomainError` and the registry passes it to the
 * AppModule's `mapDomainError` hook — that's how third-party
 * integrations ship their own HTTP semantics without ever touching
 * `src/middleware/error-handler.ts`. Delete the shop folder and the
 * central error handler is unaffected.
 */

export class ShopProvisioningError extends DomainError {
  readonly kind = "ShopProvisioningError" as const;
  constructor(
    public readonly userId: string,
    public readonly upstreamCause?: unknown,
  ) {
    super(`Failed to provision Medusa customer for user ${userId}.`);
  }
}

export function mapShopDomainError(err: unknown): AppError | undefined {
  if (err instanceof ShopProvisioningError) {
    // 503 with a generic message: the user can retry, the upstream
    // cause is logged centrally with the request id so support can
    // correlate without leaking infrastructure details.
    return serviceUnavailable("Could not set up shop account. Please try again.");
  }
  return undefined;
}
