import { defineConfig } from "vitest/config";

/**
 * Vitest config — used ONLY by the test runner.
 *
 * Vitest happens to share infrastructure with Vite, but nothing here ever
 * touches the production runtime: `dist/http/server.js` is built by tsdown
 * and run by `node`. Vite never executes outside the `vitest` CLI.
 *
 * Resolution: vitest reads `tsconfig.json` for path resolution, so it
 * inherits the project's `Bundler` moduleResolution — meaning the same
 * extensionless imports the rest of the toolchain uses.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Pin the test process to UTC so timezone-sensitive code (Date
    // formatting, day boundaries, log timestamps) behaves the same on
    // every dev laptop and on CI. To deliberately catch zone-leak bugs,
    // run a separate CI job with `TZ=Asia/Kolkata pnpm test`.
    env: { TZ: "UTC" },
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "src/generated"],
    // CI shouldn't fail just because no test files exist yet.
    passWithNoTests: true,
    // Process-per-file isolation — safest for code that touches singletons
    // like the Prisma client.
    pool: "forks",
    isolate: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.{test,spec}.ts",
        "src/**/*.d.ts",
        "src/generated/**",
        "src/http/server.ts",
        "src/types/**",
      ],
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
