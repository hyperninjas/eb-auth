# Instructions for Claude

Read this file FIRST before making changes. It captures conventions that
aren't obvious from the code and rules that prevent specific mistakes.
For full developer documentation, see [CONTRIBUTING.md](CONTRIBUTING.md);
for setup, see [README.md](README.md).

---

## What this project is

A TypeScript backend service: Express 5 + Better Auth + Prisma 7 +
Postgres + Redis. ESM-only, Node 24+. Built for horizontal scaling
behind a load balancer.

## Tooling — what runs what

| Concern      | Tool                       | Command          |
| ------------ | -------------------------- | ---------------- |
| Dev runner   | tsx (`tsx watch`)          | `pnpm dev`       |
| Prod bundler | tsdown (Rolldown)          | `pnpm build`     |
| Type-check   | tsc                        | `pnpm typecheck` |
| Test runner  | **Vitest** (NOT Jest)      | `pnpm test`      |
| Lint         | ESLint 10 (flat config)    | `pnpm lint`      |
| Format       | Prettier 3                 | `pnpm format`    |
| ORM          | Prisma 7 (`prisma-client`) | `pnpm prisma:*`  |
| Auth         | Better Auth 1.6            | n/a              |
| API docs     | zod-openapi + Scalar       | n/a              |

**Vite is NOT in the runtime path.** Vitest happens to share Vite's
infrastructure for the test runner only — `dist/server.mjs` never
imports Vite. Don't suggest replacing Vitest with Jest; we already
considered it and Jest's ESM story is too rough.

## Where things live

```
src/
├── config/env.ts          ← zod-validated env (the only place to read process.env)
├── infra/                 ← process-wide singletons (prisma, redis, logger, metrics)
├── middleware/            ← request-scoped, one concern per file
├── modules/<feature>/     ← feature modules; routes, controller, service, repo, schema, dto, openapi
├── modules/index.ts       ← THE module registry — every module mounts via this array
├── modules/auth/
│   └── post-signup-hooks.ts  ← push-based hook registry (integration modules push here)
├── modules/shop/          ← CANONICAL reference for integration modules (see below)
├── http/app.ts            ← createApp() (no listen — testable)
├── http/server.ts         ← bootstrap + graceful shutdown
├── http/openapi.ts        ← merges per-module paths
├── http/openapi-shared.ts ← ERROR_CODES, errorResponseSchema, paginatedResponse
├── errors/app-error.ts    ← AppError + factories (notFound, conflict, etc.)
├── errors/domain.ts       ← DomainError base + per-module domain errors
└── generated/             ← .gitignored — Prisma client + auto-generated zod schemas
```

Use `src/modules/devices/` as the canonical reference for **feature modules**.
Use `src/modules/shop/` as the canonical reference for **integration modules** (external APIs / third-party services).

---

## Integration modules — adding external services

This section documents the pattern established by the Medusa/shop integration. Follow it exactly when adding the next external service (payment provider, email/SMS, search, analytics, etc.).

### The core contract

An integration module is **completely self-contained** — adding it touches exactly two lines in `src/modules/index.ts` and zero other core files. Removing it is the mirror operation.

The two lines in `src/modules/index.ts`:

```ts
import { createShopModule } from "./shop"; // 1 — import
const shop = createShopModule();
if (shop) optionalModules.push(shop); // 2 — conditional push
```

That's it. No edits to `env.ts`, `error-handler.ts`, `app.ts`, or `auth.ts`.

### File layout for an integration module

```
src/modules/<integration>/
├── index.ts               ← ONLY public export: create<Integration>Module()
├── <m>.config.ts          ← module-local Zod env schema + loadConfig()
├── <m>.client.ts          ← HTTP client for the external service
├── <m>.errors.ts          ← DomainError subclasses + map<M>DomainError()
├── <m>.provision.ts       ← (if needed) account provisioning logic
├── <m>.proxy.ts           ← (if needed) HTTP proxy router
└── <m>.repository.ts      ← (if needed) Prisma calls for the module's own tables
```

`create<Integration>Module()` returns `AppModule | null`. Returning `null` when the integration is disabled is what allows the registry to skip the module without a conditional in any other file.

### Module-local env validation

Do NOT add integration env vars to `src/config/env.ts`. Put them in `<m>.config.ts`:

```ts
// blankAsUndefined makes z.preprocess handle empty-string env vars correctly —
// `.env` files often have `MEDUSA_ADMIN_TOKEN=` with no value, which is an
// empty string in process.env (not undefined), so .min(1).optional() would
// reject it. Preprocessing to undefined makes optional/required work as intended.
const blankAsUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

// Pattern: SHOP_ENABLED acts as master switch; when false, loadConfig() returns
// null and create<M>Module() returns null immediately (zero env vars required).
// When true, collect ALL missing required vars and throw a single complete error.
```

### The push-based post-signup hook

Integration modules that need to run logic after a user signs up use the push-based registry in `src/modules/auth/post-signup-hooks.ts`. They call `registerUserCreateHook(fn)` inside their `create<M>Module()` at activation time.

**Why push-based, not direct import from `auth.ts`**: The shop proxy imports `auth-guard.ts`, which imports `auth.ts`. If `auth.ts` imported `shop/`, that would be a circular dependency. The registry inverts the direction — `auth.ts` imports only the registry file, integration modules push into it. `auth.ts` has zero compile-time knowledge of any integration.

### The domain error hook

Each integration module ships its own `mapDomainError` function and registers it via the `AppModule.mapDomainError` field. The central error handler in `error-handler.ts` walks all modules' hooks before falling back to its own core mappings. Removing the module folder removes its error mapper automatically — no orphan branches in the central handler.

### The proxy pattern (for REST API integrations)

When an integration wraps an upstream REST API (like Medusa), prefer a **reverse proxy** over typed endpoints:

- Proxy all store/API routes through a catch-all (`Router.all("/<prefix>/*splat")`).
- Inject required auth headers (`x-publishable-api-key`, `Authorization`) server-side.
- Only intercept specific operations that need server-side logic (e.g. attaching a customer to a cart on creation).
- Rewrite upstream error envelopes into our standard `ErrorResponse` shape.
- Browsers NEVER talk to the upstream service directly.

This means zero new code is needed when the upstream adds new endpoints — the proxy forwards anything that comes through.

### The 3-layer provisioning pattern

When an integration needs a "linked account" in the external system (e.g. a Medusa customer for each eb-auth user), use this fallback chain:

1. **Mapping table fast path** — check our own DB first (`O(1)` Postgres lookup, no upstream call).
2. **Find-by-ID/email recovery** — if our mapping is missing, ask the upstream. The record may exist from a previous (half-completed) provision attempt, a backup/restore scenario, or an out-of-band admin action. Link to it instead of creating a duplicate.
3. **Create + collision recovery** — if not found, create. On collision (another pod/request raced us), retry the find. Only throw `<M>ProvisioningError` if both the create AND the recovery find fail simultaneously — that's the real "upstream is down" signal, not a race condition.

Add an **in-process inflight dedup map** (`Map<userId, Promise<string>>`) to coalesce concurrent provisioning calls for the same user within a single process. Cross-replica races are handled by Layer 2.

**Signup hook = fire-and-forget**. The `makeBetterAuthUserCreateHook` wrapper fires provisioning in the background so a slow/down external service never blocks signup. The lazy retry on the next API call is the safety net.

### Detachment recipe (removing an integration)

For the shop integration specifically:

1. `rm -rf src/modules/shop`
2. Remove the 3 lines in `src/modules/index.ts` (import + `createShopModule()` call + push)
3. Drop the `UserCommerceProfile` model + the `commerceProfile` relation on `User` in `prisma/schema.prisma`
4. `pnpm prisma migrate dev --name drop_shop_integration`
5. `docker compose stop medusa && docker compose rm -f medusa` (stop the Medusa container)
6. Remove the `medusa:` service block from `docker-compose.yml`
7. Optionally: `docker compose exec postgres dropdb -U eb_auth medusa`
8. Optionally: `rm -rf commerce/`

For future integrations: steps 1–4 are universal. Steps 5+ depend on what infrastructure the integration added.

**Zero edits required to**: `env.ts`, `error-handler.ts`, `app.ts`, `auth.ts`, or any other core file.

## Hard rules — read these before editing

### 1. There is exactly ONE source of truth for shapes: `prisma/schema.prisma`

- Database column → Prisma model → `pnpm prisma generate` →
  `src/generated/prisma/` (Prisma `Device` type) and
  `src/generated/zod/schemas/variants/pure/Device.pure.ts`
  (`DeviceModelSchema`).
- Every Zod schema for DB-shaped data is built from `DeviceModelSchema`
  via `.pick({...}).extend({...})`. **NEVER hand-write a new
  `z.object({ id, deviceId, ... })`** — that's drift waiting to happen.
- Every TS type for DB-shaped data is `z.infer<typeof someSchema>` or
  imported from `@prisma/client` (via `src/generated/prisma/client`).

If you find yourself writing duplicate field names in two places, stop
and derive one from the other.

### 2. Errors are THROWN, never written

There is exactly one place that constructs error response bodies:
[src/middleware/error-handler.ts](src/middleware/error-handler.ts).

- **Inside any middleware/handler**, do `next(notFound("..."))`,
  not `res.status(404).json(...)`.
- **Inside services**, throw `DomainError` subclasses (see
  `src/errors/domain.ts`). Never throw `AppError` from a service —
  that couples business logic to HTTP semantics.
- **New error codes go in `ERROR_CODES`** in
  [src/http/openapi-shared.ts](src/http/openapi-shared.ts). Use the
  matching factory in [src/errors/app-error.ts](src/errors/app-error.ts);
  add a new factory if needed. Never `new AppError(...)` directly.
- **New domain errors** go in `src/errors/domain.ts` AND get a branch
  in `mapDomainError()` in the error handler.

### 3. Module boundaries are enforced via barrels

- Inside a module folder, import siblings with relative paths
  (`./devices.service`).
- Outside a module folder, import ONLY from the barrel
  (`../modules/devices`), never from a deep path
  (`../modules/devices/devices.service`).
- The barrel (`src/modules/<m>/index.ts`) is the public API. If
  something isn't exported there, it's a private implementation detail.

### 4. Every endpoint goes through `validate()`

Routes apply `validate({ body, query, params })` middleware. The
controller reads `req.validated.body` (etc.) via the `ValidatedRequest`
type. **Never call `schema.parse(req.body)` inside a controller** —
that's what the middleware exists to prevent.

### 5. Every controller types `Response<T>`

```ts
create: async (
  req: Request,
  res: Response<DeviceCreateResponse>,
): Promise<void> => { ... }
```

`DeviceCreateResponse` is exported from `<m>.openapi.ts` and inferred
from the same Zod schema the OpenAPI document uses. This makes
`res.json(...)` only accept payloads matching the published spec.

### 6. Imports have NO `.js` extensions

`tsconfig.json` uses `moduleResolution: Bundler`. Write
`from "./devices.service"`, not `from "./devices.service.js"`. tsx,
vitest, and tsdown all handle extensionless imports natively.

### 7. Bracket access for index signatures

`tsconfig.json` enables `noPropertyAccessFromIndexSignature`:

- `process.env["FOO"]` ✓ (better: import from `config/env.ts`)
- `req.params["id"]` ✓ (better: get from `req.validated.params`)
- `(user as Record<string, unknown>)["isAdmin"]` ✓

`process.env.FOO` and `req.params.id` are typecheck errors.

### 8. Use `getLogger()`, not bare `logger`

`getLogger()` returns a pino child logger bound to the active request
id (and user id, after auth-guard runs). The bare `logger` works but
loses request correlation.

```ts
import { getLogger } from "../infra/logger";

export async function doStuff() {
  getLogger().info({ deviceId: id }, "registered device");
}
```

Never `console.log` — ESLint flags it and pino redacts secrets that
console doesn't.

### 9. Comments explain WHY, not WHAT

- Don't comment what the next line does.
- Do comment why it's that way: a past incident, a constraint, an
  intentional tradeoff, a non-obvious interaction with another file.
- Top-of-file JSDoc on infra/middleware files should explain the
  file's role.

### 10. Don't add `async` to a function that doesn't `await`

ESLint flags `require-await`. If a function must return a Promise to
satisfy a library signature (e.g. Better Auth callbacks), drop `async`
and `return Promise.resolve()` explicitly.

## Don't do this (anti-patterns I've seen tempted)

| ❌ Don't                                            | ✅ Do                                                      |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Suggest replacing Vitest with Jest                  | Vitest is correct here; ESM rules out Jest                 |
| Suggest adding Vite to runtime                      | Vite stays in `vitest` only                                |
| Add a new `z.object({})` for a DB shape             | Derive from `DeviceModelSchema`                            |
| Add a new error code inline as a string             | Add to `ERROR_CODES`, use a factory                        |
| Edit anything in `src/generated/`                   | It's auto-generated; edit the source instead               |
| Use `any`                                           | Define a narrow local interface and cast through that      |
| Add `.js` to an import                              | Bundler resolution — no extensions                         |
| `res.status(...).json({...})` for an error          | `next(appErrorFactory(...))`                               |
| `throw new AppError(...)` from a service            | `throw new SomeDomainError(...)`                           |
| `try/catch` an error just to wrap and rethrow       | Let it bubble — the central handler maps it                |
| Mount a module-local `errorHandler`                 | The global one in `app.ts` is enough                       |
| `process.env.FOO` direct read                       | `env.FOO` from `config/env.ts`                             |
| Block the event loop with sync work                 | Pino is async-transport in prod for a reason               |
| Add integration env vars to `config/env.ts`         | Put them in `<m>.config.ts` (module-local validation)      |
| `import { shopService } from "./shop"` in `auth.ts` | Use the push-based hook registry in `post-signup-hooks.ts` |
| Write a new typed endpoint per upstream route       | Proxy the upstream; only intercept what needs it           |
| Edit `error-handler.ts` when adding an integration  | Register `mapDomainError` on the `AppModule` instead       |

## Things you might be tempted to "fix" but shouldn't

- **`requestId` is `optional` in `errorResponseSchema`** — yes, even
  though it's always present in HTTP responses. The reason is
  `getRequestId()` is `string | undefined` outside a request scope.
  Tightening to required would require an `as string` cast in the
  error handler. Not worth it.
- **`PaginatedResult<T>` interface in services and `paginatedResponse(s)`
  in openapi-shared** — the service returns one and the OpenAPI doc
  defines the other; both are derivations of the same `Pagination`
  type from `openapi-shared.ts`. Not duplication.
- **Dual `errorHandler` mounts** — there's only one, mounted globally
  in `app.ts`. The module routers do NOT mount their own. (Earlier
  versions of the codebase did; that was wrong and got cleaned up.)
- **`x-powered-by` is disabled** — don't re-enable it.
- **`trust proxy` is set via `env.TRUST_PROXY`** in production — don't
  hardcode it.
- **Better Auth's catch-all is mounted with `rawBody: true`** — it
  reads the raw stream and breaks if `express.json()` runs first.
  The module registry handles this; don't change the order.
- **Pre-commit hook runs `lint-staged`** — don't bypass with
  `--no-verify` without explicit user approval.

## Things to verify before saying "done"

When you make changes, run this minimum set before reporting success:

```bash
pnpm typecheck   # must be clean
pnpm lint        # must be clean
pnpm test        # must pass (or document why a test was skipped)
pnpm build       # must produce dist/server.mjs
```

For non-trivial changes (new endpoints, error handling, infra), also
do a live boot smoke test against the local docker-compose stack:

```bash
docker compose up -d
# create a probe.mts that imports createApp() and hits the new endpoint
PORT=3001 ... pnpm exec tsx ./probe.mts
docker compose down
```

The user has caught real bugs at this stage that the static checks
missed (e.g. ESM module init order with `extendZodWithOpenApi`).

## When the user asks "should I do X?"

The user has shown clear preferences:

- **Backend-native tools, no frontend bloat** — prefer `tsx`, `tsdown`,
  `node:test`/`vitest`, `prom-client` over framework-y alternatives.
- **Latest stable versions** — when picking a dep, check npm registry
  for the current `latest` tag, don't guess.
- **Strategy A over Strategy B** when given a choice between "purer
  derivation with a generator" and "pragmatic with `satisfies`
  clauses" — they value consistency over minimum tooling.
- **Comments that explain context** — they want to know _why_ a
  decision was made, not just _what_ it does.
- **Real verification, not just typecheck** — when they say "make sure
  it works", they mean run the actual server and exercise it.

## When in doubt

1. Building a **feature module** (owns its own DB table, has CRUD)? Check `src/modules/devices/` — that's the reference implementation.
2. Building an **integration module** (wraps an external API/service)? Check `src/modules/shop/` — that's the reference implementation.
3. Check `CONTRIBUTING.md` for the relevant how-to recipe.
4. If still unsure, ask before making invasive changes. The user prefers a 30-second clarifying question over a 30-minute revert.
