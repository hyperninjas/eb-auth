import type { AppModule } from "..";
import { getLogger } from "../../infra/logger";
import type { EpcClient } from "../epc";
import type { EpcCache } from "../epc";
import { loadEnergyProfileConfig } from "./energy-profile.config";
import { createEnergyProfileCache } from "./energy-profile.cache";
import { createPvgisClient } from "./clients/pvgis.client";
import { createOctopusClient } from "./clients/octopus.client";
import { createEnergyProfileService } from "./energy-profile.service";
import { createEnergyProfileController } from "./energy-profile.controller";
import { createEnergyProfileRouter } from "./energy-profile.routes";
import { energyProfilePaths } from "./energy-profile.openapi";
import { mapEnergyProfileDomainError } from "./energy-profile.errors";

/**
 * Public API of the energy-profile module.
 *
 * Returns `null` when `ENERGY_PROFILE_ENABLED` is not `"true"`, so the
 * registry skips it without any other file knowing the module exists.
 *
 * Hard-depends on the EPC module — if EPC is disabled, the energy-profile
 * module cannot function (it needs the EPC client for certificate lookups
 * and UPRN history).
 *
 * Detachment recipe:
 *   1. `rm -rf src/modules/energy-profile`
 *   2. Remove the lines in `src/modules/index.ts` (import + call + push)
 *   3. Remove the `propertyProfile` relation from User in schema.prisma
 *   4. Delete the 6 models from schema.prisma
 *   5. `pnpm prisma migrate dev --name drop_energy_profile`
 */

export interface CreateEnergyProfileModuleDeps {
  epcClient: EpcClient;
  epcCache: EpcCache;
}

export function createEnergyProfileModule(deps: CreateEnergyProfileModuleDeps): AppModule | null {
  const config = loadEnergyProfileConfig();
  if (!config) {
    getLogger().info("Energy-profile module disabled (ENERGY_PROFILE_ENABLED is not 'true')");
    return null;
  }

  const cache = createEnergyProfileCache(config);
  const pvgisClient = createPvgisClient(config);
  const octopusClient = createOctopusClient(config);

  const service = createEnergyProfileService({
    epcClient: deps.epcClient,
    pvgisClient,
    octopusClient,
    cache,
    config,
  });

  const controller = createEnergyProfileController(service);
  const router = createEnergyProfileRouter(controller);

  getLogger().info("Energy-profile module enabled");

  return {
    mountPath: "/api/energy-profile",
    router,
    openapi: energyProfilePaths,
    mapDomainError: mapEnergyProfileDomainError,
  };
}
