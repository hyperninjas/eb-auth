import type { AppModule } from "..";
import { getLogger } from "../../infra/logger";
import { loadEpcConfig } from "./epc.config";
import { createEpcClient, type EpcClient } from "./epc.client";
import { createEpcCache, type EpcCache } from "./epc.cache";
import { createEpcRouter } from "./epc.routes";
import { epcPaths } from "./epc.openapi";
import { mapEpcDomainError } from "./epc.errors";

// Re-export types so other modules can import from the barrel
export type { EpcClient, EpcCertificate, EpcSearchResult } from "./epc.client";
export type { EpcCache } from "./epc.cache";

/** AppModule extended with the EPC client and cache for dependency injection. */
export type EpcAppModule = AppModule & { client: EpcClient; cache: EpcCache };

/**
 * Public API of the EPC module.
 *
 * Returns `null` when `EPC_ENABLED` is not `"true"`, so the registry
 * skips it without any other file knowing the module exists.
 *
 * The return type exposes `client` and `cache` so that dependent modules
 * (e.g. energy-profile) can receive them via dependency injection
 * without creating a second HTTP client instance.
 *
 * Detachment recipe:
 *   1. `rm -rf src/modules/epc`
 *   2. Remove the 3 lines in `src/modules/index.ts` (import + call + push)
 *   No DB models, no migrations, no other files to touch.
 */
export function createEpcModule(): EpcAppModule | null {
  const config = loadEpcConfig();
  if (!config) {
    getLogger().info("EPC module disabled (EPC_ENABLED is not 'true')");
    return null;
  }

  const client = createEpcClient(config);
  const cache = createEpcCache(config);
  const router = createEpcRouter({ client, cache });

  getLogger().info({ baseUrl: config.baseUrl }, "EPC module enabled");

  return {
    mountPath: "/api/epc",
    router,
    openapi: epcPaths,
    mapDomainError: mapEpcDomainError,
    client,
    cache,
  };
}
