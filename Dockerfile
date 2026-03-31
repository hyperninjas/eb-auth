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

# Copy only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output and data
COPY --from=build /app/dist ./dist
COPY data ./data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
