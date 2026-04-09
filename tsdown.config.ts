import { defineConfig } from "tsdown";

/**
 * Production bundler. tsdown is the Rolldown-powered successor to tsup —
 * ESM-first, ~2-8x faster than esbuild-based bundlers.
 *
 * Strategy: bundle our own source into a single file. tsdown automatically
 * externalizes anything listed in `dependencies`, `peerDependencies` and
 * `optionalDependencies`, so the runtime imports them from `node_modules`
 * at boot — no native-module binary headaches, smaller image diffs.
 *
 * Output: dist/server.mjs (matches `main` and `start` script).
 *
 * `tsx` handles dev (no bundling — fast on-demand transpile + watch).
 * `tsc --noEmit` handles type-checking.
 */
export default defineConfig({
  entry: ["src/http/server.ts"],
  outDir: "dist",
  format: "esm",
  target: "node24",
  platform: "node",
  sourcemap: true,
  clean: true,
  dts: false,
  // Belt-and-braces: also skip bundling anything from node_modules even
  // if it's not listed in package.json (e.g. transitive deps imported by
  // a Better Auth plugin).
  deps: {
    skipNodeModulesBundle: true,
  },
});
