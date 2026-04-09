import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

/**
 * Medusa v2 configuration for the eb-auth commerce backend.
 *
 * Two things make this config different from the stock starter:
 *
 *   1. `http.authMethodsPerActor` disables CUSTOMER auth providers
 *      entirely. The parent eb-auth service (Better Auth) is the sole
 *      identity authority for storefront users. Customers exist in
 *      Medusa as commerce records linked to a Better Auth user.id via
 *      `metadata.external_user_id`, but Medusa never authenticates them
 *      and never issues them tokens. Admin users still authenticate
 *      against Medusa with emailpass — that's a separate, ops-only
 *      surface used to access the admin dashboard.
 *
 *   2. `databaseUrl` and `redisUrl` point at the SAME Postgres
 *      instance and the SAME Redis instance the parent service uses,
 *      but a different database (`medusa`) and a different Redis
 *      logical DB (1 vs 0). This keeps resource usage low in dev while
 *      preserving module isolation: Medusa runs its own migrations on
 *      its own database and never sees Better Auth's tables.
 *
 * CORS notes: only the parent eb-auth service ever calls Medusa.
 * Browsers do NOT hit Medusa directly — they go through the eb-auth
 * /api/shop/* proxy. So the CORS lists below only need to allow the
 * eb-auth service and the Medusa admin dashboard origin.
 */
module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      // The proxy is server-to-server, so the eb-auth API origin is
      // the only storefront caller. Admin and auth CORS allow the
      // local dashboard for ops use.
      storeCors: process.env.STORE_CORS || "",
      adminCors: process.env.ADMIN_CORS || "http://localhost:9000",
      authCors: process.env.AUTH_CORS || "http://localhost:9000",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
      // Disable every customer-side auth provider. Admin still uses
      // emailpass so the dashboard works. Removing all customer
      // providers means Medusa won't accept POST /auth/customer/* and
      // the AuthIdentity table is never populated for storefront users.
      authMethodsPerActor: {
        user: ["emailpass"],
        customer: [],
      },
    },
  },
});
