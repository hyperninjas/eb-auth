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
├── http/app.ts            ← createApp() (no listen — testable)
├── http/server.ts         ← bootstrap + graceful shutdown
├── http/openapi.ts        ← merges per-module paths
├── http/openapi-shared.ts ← ERROR_CODES, errorResponseSchema, paginatedResponse
├── errors/app-error.ts    ← AppError + factories (notFound, conflict, etc.)
├── errors/domain.ts       ← DomainError base + per-module domain errors
└── generated/             ← .gitignored — Prisma client + auto-generated zod schemas
```

Use `src/modules/devices/` as the canonical reference when working on
any module — its file layout is the convention.

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

| ❌ Don't                                      | ✅ Do                                                 |
| --------------------------------------------- | ----------------------------------------------------- |
| Suggest replacing Vitest with Jest            | Vitest is correct here; ESM rules out Jest            |
| Suggest adding Vite to runtime                | Vite stays in `vitest` only                           |
| Add a new `z.object({})` for a DB shape       | Derive from `DeviceModelSchema`                       |
| Add a new error code inline as a string       | Add to `ERROR_CODES`, use a factory                   |
| Edit anything in `src/generated/`             | It's auto-generated; edit the source instead          |
| Use `any`                                     | Define a narrow local interface and cast through that |
| Add `.js` to an import                        | Bundler resolution — no extensions                    |
| `res.status(...).json({...})` for an error    | `next(appErrorFactory(...))`                          |
| `throw new AppError(...)` from a service      | `throw new SomeDomainError(...)`                      |
| `try/catch` an error just to wrap and rethrow | Let it bubble — the central handler maps it           |
| Mount a module-local `errorHandler`           | The global one in `app.ts` is enough                  |
| `process.env.FOO` direct read                 | `env.FOO` from `config/env.ts`                        |
| Block the event loop with sync work           | Pino is async-transport in prod for a reason          |

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

1. Check if there's an existing pattern in `src/modules/devices/` —
   that module is the reference implementation.
2. Check `CONTRIBUTING.md` for the relevant how-to recipe.
3. If still unsure, ask before making invasive changes. The user
   prefers a 30-second clarifying question over a 30-minute revert.
