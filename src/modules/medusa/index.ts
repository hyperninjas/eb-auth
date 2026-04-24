import { Router } from "express";
import type { AppModule } from "..";
import { getLogger } from "../../infra/logger";
import { registerUserCreateHook } from "../auth/post-signup-hooks";
import { loadMedusaConfig } from "./medusa.config";
import { createMedusaClient } from "./medusa.client";
import { createMedusaProvisioner, makeBetterAuthUserCreateHook } from "./medusa.provision";
import { mapMedusaDomainError } from "./medusa.errors";

/**
 * Public API of the medusa module — exactly ONE symbol leaves this folder:
 * `createMedusaModule()`. Everything else is a private implementation
 * detail of the integration.
 *
 * `createMedusaModule()` is called once from `src/modules/index.ts` at app
 * startup. If `MEDUSA_ENABLED` is unset/false it returns null and the
 * registry skips it; otherwise it constructs the Medusa client +
 * provisioner, registers the post-signup hook with the auth module's
 * push-based registry, and returns an `AppModule` for the module system.
 *
 * Why a push registry instead of auth.ts importing from us:
 *   - Importing medusa from auth.ts would create a cycle.
 *   - The registry inverts the direction so auth.ts has zero compile-time
 *     knowledge of any integration module.
 *
 * Detachment recipe (zero edits to env.ts, error-handler.ts, app.ts, auth.ts):
 *   1. `rm -rf src/modules/medusa`
 *   2. Remove the import + push lines in `src/modules/index.ts`
 *   3. The mapping table already exists in UserCommerceProfile (shared with shop)
 *      so no Prisma changes needed — or drop it if shop is also removed.
 */
export function createMedusaModule(): AppModule | null {
  const config = loadMedusaConfig();
  if (!config) {
    getLogger().info("Medusa module disabled (MEDUSA_ENABLED is not 'true')");
    return null;
  }

  const client = createMedusaClient(config);
  const provisioner = createMedusaProvisioner(client);

  // Register the post-signup hook in the auth module's registry. By the time
  // a real signup happens this is already in place — the dispatcher in auth.ts
  // iterates the registry per call, not at import time, so registration order
  // doesn't matter.
  registerUserCreateHook(makeBetterAuthUserCreateHook(provisioner));

  getLogger().info({ medusaUrl: config.medusaUrl }, "Medusa module enabled");

  return {
    // No HTTP router needed yet — provisioning is async via post-signup hooks.
    // If we add endpoints in the future (e.g. sync status check), add routes here.
    mountPath: "/api/medusa",
    router: Router(),

    // The detachable error mapper — central error-handler walks every module's
    // mapDomainError before falling back to its own core mappings. Removing
    // the medusa folder removes this mapper automatically.
    mapDomainError: mapMedusaDomainError,
  };
}
