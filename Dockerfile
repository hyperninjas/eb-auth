# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build TypeScript ───────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# ── Stage 3: Production image ──────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

# Copy all dependencies (includes @better-auth/cli for auth migrations)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy compiled output and source (needed by better-auth CLI)
COPY --from=build /app/dist ./dist
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

# Better Auth CLI migrates auth tables, then our app migrates device tables on startup
CMD ["sh", "-c", "npx @better-auth/cli migrate --yes && node dist/server.js"]