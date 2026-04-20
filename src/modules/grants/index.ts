/**
 * Grants module — UK government grant eligibility checking.
 *
 * Checks eligibility for:
 * - Boiler Upgrade Scheme (BUS): £7,500 heat pump grants
 * - Warm Homes: Local (WH:LG): Up to £30,000 insulation/heating
 * - Energy Company Obligation 4 (ECO4): Supplier-funded upgrades
 * - Smart Export Guarantee (SEG): Payment for solar export
 *
 * Module entry point — exports the router and OpenAPI paths.
 */

import type { AppModule } from "..";
import { createGrantsRouter } from "./grants.routes";
import { grantsPaths } from "./grants.openapi";
import { grantsController } from "./grants.controller";

/**
 * Create the grants module.
 * Returns an AppModule with router and OpenAPI paths.
 */
export function createGrantsModule(): AppModule {
  return {
    mountPath: "/api/grants",
    router: createGrantsRouter(grantsController),
    openapi: grantsPaths,
  };
}

// Export types for external use
export type { GrantsController } from "./grants.routes";
export { createGrantsRouter } from "./grants.routes";
