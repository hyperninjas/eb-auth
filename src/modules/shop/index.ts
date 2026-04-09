import type { AppModule } from "..";
import { getLogger } from "../../infra/logger";
import { registerUserCreateHook } from "../auth/post-signup-hooks";
import { loadShopConfig } from "./shop.config";
import { createMedusaClient } from "./shop.client";
import { createShopProvisioner, makeBetterAuthUserCreateHook } from "./shop.provision";
import { createShopProxyRouter } from "./shop.proxy";
import { mapShopDomainError } from "./shop.errors";

/**
 * Public API of the shop module — exactly ONE symbol leaves this folder:
 * `createShopModule()`. Everything else is a private implementation
 * detail of the integration.
 *
 * `createShopModule()` is called once from `src/modules/index.ts` at app
 * startup. If `SHOP_ENABLED` is unset/false it returns null and the
 * registry skips it; otherwise it constructs the Medusa client +
 * provisioner, registers the post-signup hook with the auth module's
 * push-based registry, and returns an `AppModule` for the proxy router.
 *
 * Why a push registry instead of `auth.ts` importing from us:
 *   - Importing shop from auth.ts would create a cycle
 *     (shop.proxy.ts → middleware/auth-guard.ts → modules/auth/auth.ts).
 *   - The registry inverts the direction so auth.ts has zero
 *     compile-time knowledge of any integration module.
 *
 * Detachment recipe (zero edits to env.ts, error-handler.ts, app.ts,
 * auth.ts):
 *   1. `rm -rf src/modules/shop`
 *   2. Remove the import + push lines in `src/modules/index.ts`
 *   3. Drop the `UserCommerceProfile` model + relation in schema.prisma
 *   4. `pnpm prisma migrate dev --name drop_shop_integration`
 */
export function createShopModule(): AppModule | null {
  const config = loadShopConfig();
  if (!config) {
    getLogger().info("Shop module disabled (SHOP_ENABLED is not 'true')");
    return null;
  }

  const client = createMedusaClient(config);
  const provisioner = createShopProvisioner(client);

  // Register the post-signup hook in the auth module's registry. By
  // the time a real signup happens this is already in place — the
  // dispatcher in auth.ts iterates the registry per call, not at
  // import time, so registration order doesn't matter.
  registerUserCreateHook(makeBetterAuthUserCreateHook(provisioner));

  const router = createShopProxyRouter({ config, client, provisioner });

  getLogger().info({ medusaUrl: config.medusaUrl }, "Shop module enabled");

  return {
    mountPath: "/api/shop",
    router,
    // The detachable hook — central error-handler walks every module's
    // mapDomainError before falling back to its own core mappings.
    // Removing the shop folder removes this mapper from the registry
    // automatically (because the import is gone).
    mapDomainError: mapShopDomainError,
  };
}
