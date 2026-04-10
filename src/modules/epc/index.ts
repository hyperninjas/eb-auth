import type { AppModule } from "..";
import { getLogger } from "../../infra/logger";
import { loadEpcConfig } from "./epc.config";
import { createEpcClient } from "./epc.client";
import { createEpcCache } from "./epc.cache";
import { createEpcRouter } from "./epc.routes";
import { epcPaths } from "./epc.openapi";
import { mapEpcDomainError } from "./epc.errors";

/**
 * Public API of the EPC module — exactly ONE symbol leaves this folder:
 * `createEpcModule()`. Everything else is a private implementation detail.
 *
 * Returns `null` when `EPC_ENABLED` is not `"true"`, so the registry
 * skips it without any other file knowing the module exists.
 *
 * Detachment recipe:
 *   1. `rm -rf src/modules/epc`
 *   2. Remove the 3 lines in `src/modules/index.ts` (import + call + push)
 *   No DB models, no migrations, no other files to touch.
 */
export function createEpcModule(): AppModule | null {
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
  };
}
