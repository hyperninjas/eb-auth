/**
 * Discovery shim for Better Auth's CLI.
 *
 * `@better-auth/cli` auto-discovers the auth config by scanning a fixed
 * set of paths: `./auth.ts`, `./src/auth.ts`, `./src/lib/auth.ts`,
 * `./src/utils/auth.ts`, `./src/server/auth.ts`. Our actual config lives
 * at `src/modules/auth/auth.ts` (per the per-feature module layout in
 * CONTRIBUTING.md), which the CLI doesn't know to look at.
 *
 * This file re-exports the canonical instance so that:
 *
 *   pnpm dlx @better-auth/cli@latest generate
 *   pnpm dlx @better-auth/cli@latest migrate
 *
 * "just work" — no `--config` flag needed, no documentation to remember.
 *
 * ⚠️  DO NOT import from this file inside `src/`. Use the canonical path:
 *
 *     import { auth } from "../modules/auth/auth";
 *
 * This file exists ONLY for the CLI's auto-discovery and should never be
 * referenced by application code.
 */

export { auth } from "../modules/auth/auth";
