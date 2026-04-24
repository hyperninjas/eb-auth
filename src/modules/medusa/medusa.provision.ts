import { getLogger } from "../../infra/logger";
import type { MedusaClient } from "./medusa.client";
import { MedusaProvisioningError } from "./medusa.errors";
import { medusaRepository } from "./medusa.repository";

/**
 * Customer provisioning — the only piece of "active" medusa logic.
 *
 * Two entry points share the same idempotent core:
 *
 *   1. Better Auth post-signup hook — fired automatically when a user
 *      signs up. Provisioning the customer at signup means by the time
 *      the user reaches commerce, their Medusa customer record already
 *      exists.
 *
 *   2. Lazy retry from API calls — every authenticated commerce request
 *      can call `ensureCustomerForUser()` BEFORE using the customer ID.
 *      This is the safety net for the case where Medusa was down at
 *      signup, the user signed up before medusa was enabled, or the
 *      mapping was lost in a backup/restore.
 *
 * Both paths converge on `ensureCustomerForUser()` which runs a
 * three-layer fallback chain:
 *
 *   Layer 1 — Mapping table fast path
 *     Most calls hit this. O(1) Postgres lookup, no upstream call.
 *
 *   Layer 2 — Find-by-email recovery
 *     If our mapping is missing, ASK MEDUSA. A Medusa customer with
 *     this user's email may already exist (the signup hook ran but
 *     the persist-mapping step failed; or our DB was restored from
 *     a backup older than Medusa's; or the user was created out-of-band
 *     by an admin). If found, link to it instead of creating a duplicate.
 *     This also handles the case where two concurrent requests race past
 *     Layer 1 in different replicas.
 *
 *   Layer 3 — Create
 *     No mapping, no existing Medusa customer. POST /admin/customers
 *     and persist the mapping. On collision (email already exists, because
 *     someone else just created it between our find and our create),
 *     retry the find — if it's there now, link it; otherwise the failure
 *     is real and we throw `MedusaProvisioningError` (mapped to a 503).
 *
 * Concurrency: in-process inflight dedup map coalesces concurrent
 * provisioning calls for the same user.id into a single shared promise.
 * This protects against a browser firing multiple requests in parallel
 * right after signup. For cross-replica races, Layer 2 still recovers
 * correctly because the find-by-email lookup runs against the shared
 * Medusa instance.
 *
 * Failure semantics: every layer has a non-fatal exit. The only way to
 * throw `MedusaProvisioningError` is for the create call AND its
 * collision-recovery find call to BOTH fail — which only happens when
 * Medusa is hard-down or returning errors that aren't email collisions.
 * That's the right "503 retry me" signal.
 */

export interface UserForProvisioning {
  id: string;
  email: string;
  // `string | null | undefined` (rather than `name?: string | null`) so
  // callers can pass an unprocessed `user.name` field straight through
  // even when tsconfig has `exactOptionalPropertyTypes: true`.
  name: string | null | undefined;
}

export interface MedusaProvisioner {
  /** Idempotent: returns the Medusa customer id, creating it if needed. */
  ensureCustomerForUser: (user: UserForProvisioning) => Promise<string>;
}

export function createMedusaProvisioner(client: MedusaClient): MedusaProvisioner {
  // In-process inflight dedup map. Two concurrent calls for the same user
  // share one provisioning promise instead of both racing into Medusa.
  // Map keyed by user.id; entry cleared in the finally so a follow-up
  // call after a failure can still retry.
  //
  // This is process-local — multi-replica deployments still rely on
  // Layer 2 (find-by-email) to handle cross-pod races. That layer
  // converges correctly because Medusa enforces email uniqueness on create.
  const inflight = new Map<string, Promise<string>>();

  async function provision(user: UserForProvisioning): Promise<string> {
    // ── Layer 1: mapping table fast path ──────────────────────────
    const mapping = await medusaRepository.findByUserId(user.id);
    if (mapping) return mapping.medusaCustomerId;

    // ── Layer 2: find-by-email recovery ───────────────────────────
    // A Medusa customer with this email may already exist even though our
    // mapping table doesn't know about it. If so, link to the existing
    // record instead of creating a duplicate.
    //
    // Failure to query Medusa here is non-fatal — we fall through to
    // Layer 3 (create), which will surface a clean error if Medusa is down.
    const found = await client.findCustomerByEmail(user.email).catch((err: unknown) => {
      getLogger().warn({ err, userId: user.id }, "find-by-email failed; falling through to create");
      return undefined;
    });
    if (found) {
      const profile = await medusaRepository.upsert(user.id, found.id);
      getLogger().info(
        { userId: user.id, medusaCustomerId: profile.medusaCustomerId },
        "Linked existing Medusa customer to user (recovery path)",
      );
      return profile.medusaCustomerId;
    }

    // ── Layer 3: create + collision recovery ──────────────────────
    try {
      const customer = await client.createCustomer({
        email: user.email,
        firstName: user.name ?? "",
        externalUserId: user.id,
      });
      const profile = await medusaRepository.upsert(user.id, customer.id);
      getLogger().info(
        { userId: user.id, medusaCustomerId: profile.medusaCustomerId },
        "Provisioned new Medusa customer",
      );
      return profile.medusaCustomerId;
    } catch (createErr) {
      // Possible race: another request (or another pod) created the customer
      // between our find at Layer 2 and our create here. Retry the find —
      // if it's there now, link it.
      const recovered = await client.findCustomerByEmail(user.email).catch(() => undefined);
      if (recovered) {
        const profile = await medusaRepository.upsert(user.id, recovered.id);
        getLogger().info(
          { userId: user.id, medusaCustomerId: profile.medusaCustomerId },
          "Recovered existing Medusa customer after create collision",
        );
        return profile.medusaCustomerId;
      }
      // Genuinely failed — Medusa is down or returning errors that
      // aren't email collisions. Surface as a domain error.
      getLogger().error({ err: createErr, userId: user.id }, "Medusa provisioning failed");
      throw new MedusaProvisioningError(user.id, createErr);
    }
  }

  return {
    ensureCustomerForUser: (user) => {
      // Coalesce concurrent calls for the same user into one shared promise.
      // The in-flight entry is cleared in finally so a follow-up call after
      // a failure can retry from scratch.
      const existing = inflight.get(user.id);
      if (existing) return existing;
      const promise = provision(user).finally(() => {
        inflight.delete(user.id);
      });
      inflight.set(user.id, promise);
      return promise;
    },
  };
}

/**
 * Adapter for Better Auth's `databaseHooks.user.create.after`. Better Auth
 * calls this with the freshly-created user record; we kick off provisioning
 * fire-and-forget so a Medusa outage NEVER blocks signup.
 *
 * Why fire-and-forget instead of awaiting:
 *   - Signup is on the critical path; commerce is not.
 *   - The lazy retry in subsequent API calls converges anyway.
 *   - A Medusa outage at signup time would otherwise turn into a 503 on
 *     `/api/auth/sign-up`, breaking authentication for users who don't
 *     even use commerce.
 */
export function makeBetterAuthUserCreateHook(provisioner: MedusaProvisioner) {
  return (user: { id: string; email: string; name: string | null | undefined }): Promise<void> => {
    // The hook returns immediately. The promise running in the background
    // catches its own errors so an unhandled rejection doesn't crash the worker.
    void provisioner
      .ensureCustomerForUser({ id: user.id, email: user.email, name: user.name })
      .catch(() => {
        // Already logged inside ensureCustomerForUser. Swallow here so
        // the lazy-retry path on the next commerce API call gets a
        // second chance.
      });
    return Promise.resolve();
  };
}
