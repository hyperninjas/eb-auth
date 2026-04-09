/**
 * Domain errors — thrown by the service / repository layer.
 *
 * These carry NO HTTP semantics. A service that throws `DeviceNotFoundError`
 * doesn't know or care about HTTP status codes. The mapping from a domain
 * error to an HTTP response happens exactly once, in `errorHandler`. That
 * lets the same service be reused from non-HTTP entrypoints (CLI scripts,
 * queue workers, gRPC) without inheriting an irrelevant 404 status code.
 *
 * Pattern: every domain error has a literal `kind` discriminator so the
 * error handler can switch on it without `instanceof` chains. New domain
 * errors register here and add a branch in `mapDomainError` (in
 * `src/middleware/error-handler.ts`).
 */

export abstract class DomainError extends Error {
  abstract readonly kind: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Devices ──────────────────────────────────────────────────────────────

export class DeviceNotFoundError extends DomainError {
  readonly kind = "DeviceNotFoundError" as const;
  constructor(public readonly id: string) {
    super(`Device ${id} not found.`);
  }
}
