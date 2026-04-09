import { getLogger } from "../../infra/logger";

/**
 * Push-based registry for Better Auth post-signup hooks.
 *
 * Why this file exists: integration modules (shop, future
 * notifications, analytics, ...) need to react when a user signs up,
 * but importing those modules from `auth.ts` creates a circular
 * dependency — they in turn need things from auth (the session
 * accessor in `auth-guard.ts`).
 *
 * The registry breaks the cycle by inverting the direction:
 *
 *   - `auth.ts` reads from the registry INSIDE its
 *     `databaseHooks.user.create.after` callback. Reads happen at
 *     call time (per signup), not at import time, so the registry
 *     can be empty when auth.ts loads.
 *
 *   - Each integration module pushes its hook into the registry from
 *     its own activation factory (e.g. shop's `createShopModule()`).
 *     By the time a real signup happens, every enabled integration
 *     has already registered.
 *
 * Hooks are fire-and-forget: returning rejected promises here CANNOT
 * fail signup. A Medusa outage at signup time would otherwise turn
 * into a 503 on `/api/auth/sign-up` and break authentication entirely
 * for users who don't even use the shop. Each hook catches its own
 * errors; this dispatcher just logs anything that escapes.
 */

export interface SignedUpUser {
  id: string;
  email: string;
  // string | null | undefined (rather than `name?: string | null`) so
  // callers can pass an unprocessed Better Auth user.name field through
  // even with `exactOptionalPropertyTypes: true` in tsconfig.
  name: string | null | undefined;
}

export type UserCreateHook = (user: SignedUpUser) => Promise<void> | void;

const userCreateHooks: UserCreateHook[] = [];

/**
 * Register a hook to run after a user is created. Called once at
 * integration-module activation time. Order is registration order;
 * the dispatcher does not enforce serial execution between hooks.
 */
export function registerUserCreateHook(hook: UserCreateHook): void {
  userCreateHooks.push(hook);
}

/**
 * Run every registered post-signup hook fire-and-forget. Called from
 * `auth.ts`'s `databaseHooks.user.create.after`. Returns immediately;
 * the hooks run in the background. Any synchronous throw or rejected
 * promise is logged here as a safety net so an unhandled rejection
 * doesn't crash the worker.
 */
export function runUserCreateHooks(user: SignedUpUser): void {
  for (const hook of userCreateHooks) {
    try {
      const result = hook(user);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          getLogger().error({ err, userId: user.id }, "Post-signup hook rejected");
        });
      }
    } catch (err) {
      getLogger().error({ err, userId: user.id }, "Post-signup hook threw");
    }
  }
}
