# syntax=docker/dockerfile:1.7

# ── Stage 1: Install all dependencies (incl. dev) ───────────────────────────
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Generate Prisma client + bundle with tsdown ────────────────────
FROM deps AS build
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
# Prisma 7's prisma.config.ts strictly requires DATABASE_URL at config-load
# time. `prisma generate` doesn't actually connect to the DB, so a placeholder
# is enough to satisfy the env() resolver during the image build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma generate \
 && pnpm run build

# ── Stage 3: Production image ───────────────────────────────────────────────
FROM node:24-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
# wget is needed by the HEALTHCHECK below.
RUN apk add --no-cache wget
WORKDIR /app

# Production deps only. The Prisma client is already generated in the build
# stage and copied in below, so we don't re-run `prisma generate` here —
# Prisma 7's config strictly requires DATABASE_URL at config-load time, which
# isn't available at image build time.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod

# Compiled output (tsdown writes to dist/) + the generated Prisma client.
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated

ENV NODE_ENV=production
# --enable-source-maps maps stack traces from the bundled file back to the
# original source paths so prod errors stay readable.
ENV NODE_OPTIONS=--enable-source-maps

EXPOSE 3000

# Container-level health check. /livez is dependency-free so it's the
# right probe for "is the process responsive at all?".
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3000/livez || exit 1

# Run pending Prisma migrations, then start the server.
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/server.mjs"]
