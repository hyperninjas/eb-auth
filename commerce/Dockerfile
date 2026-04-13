# syntax=docker/dockerfile:1.7
#
# Medusa v2 production image — multi-stage.
#
# Stage 1 (builder): all deps + medusa build → .medusa/server/
# Stage 2 (runner):  only .medusa/server/ with prod deps + config + scripts
#
# Result: lightweight image with zero devDeps.

# ── Stage 1: build ────────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-fund --no-audit --loglevel=warn

COPY . .

# Build backend + admin dashboard. 2 GB heap for the Vite admin build.
RUN NODE_OPTIONS=--max-old-space-size=2048 npm run build

# Install only production deps inside the built artifact so the runner
# stage ships a self-contained .medusa/server with minimal node_modules.
RUN cd .medusa/server && npm install --omit=dev --no-fund --no-audit --loglevel=warn

# ── Stage 2: runner ───────────────────────────────────────────────────
FROM node:24-alpine

# psql for ensure-db.sh (creates the database on first boot) +
# wget for the healthcheck.
RUN apk add --no-cache postgresql-client wget

WORKDIR /app

# Copy the self-contained production artifact.
COPY --from=builder /app/.medusa/server .medusa/server

# Copy config + scripts needed at runtime.
COPY medusa-config.ts ./
COPY scripts/ scripts/
COPY tsconfig.json ./

# The medusa CLI lives inside the production artifact's node_modules.
ENV PATH="/app/.medusa/server/node_modules/.bin:$PATH"
ENV NODE_ENV=production
ENV TZ=UTC
ENV HOST=0.0.0.0
ENV PORT=9000

EXPOSE 9000

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=60s \
  CMD wget -q --spider http://localhost:9000/health || exit 1

CMD ["sh", "scripts/start.sh"]
