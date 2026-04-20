/**
 * Domain errors for the grants module.
 */

import { DomainError } from "../../errors/domain";

export class GrantProfileNotFoundError extends DomainError {
  readonly kind = "GrantProfileNotFoundError" as const;
  constructor(userId: string) {
    super(`Grant profile not found for user ${userId}`);
  }
}

export class PropertyProfileNotFoundError extends DomainError {
  readonly kind = "PropertyProfileNotFoundError" as const;
  constructor(userId: string) {
    super(
      `Property profile not found for user ${userId}. Please set up your energy profile first.`,
    );
  }
}

export class InvalidGrantProfileDataError extends DomainError {
  readonly kind = "InvalidGrantProfileDataError" as const;
  constructor(message: string) {
    super(`Invalid grant profile data: ${message}`);
  }
}
