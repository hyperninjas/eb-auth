# syntax=docker/dockerfile:1.7
#
# Medusa v2 dev container.
#
# This is a single-stage image optimised for local docker-compose use:
# fast first-build, idempotent on container restart, and the migrate
# step runs on every boot so a fresh checkout converges to a working
# database without any extra commands.
#
# For production we'd want a multi-stage build that runs `medusa build`
# (which produces .medusa/server) and then runs `medusa start` from
# the compiled output. Add that when commerce ships to prod.

FROM node:24-alpine

# Native build deps for any sharp/argon2/etc. transitive packages.
# Stripped via `apk add --no-cache` so they don't bloat the layer.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install deps first so this layer caches across source edits. We use
# npm here (not pnpm) to match the upstream Medusa starter — Medusa's
# CLI assumes npm scripts and the v2 monorepo deps have had occasional
# pnpm hoisting quirks.
COPY package.json ./
RUN npm install --no-fund --no-audit --loglevel=warn

# Copy the rest of the project. .dockerignore should exclude
# node_modules and .medusa so the host scratch dirs don't shadow the
# container's installed deps.
COPY . .

# Container clock pinned to UTC — same rule as the eb-auth service.
# Every timestamp Medusa writes (orders, sessions, audit logs) lands in
# the shared Postgres in UTC and stays comparable with eb-auth rows.
ENV TZ=UTC
ENV NODE_ENV=development
# Bind to all interfaces so the parent eb-auth container can reach
# this service via the docker-compose network.
ENV HOST=0.0.0.0
ENV PORT=9000

EXPOSE 9000

# Run pending migrations, then start the dev server. `db:migrate` is
# idempotent — applying the same migration twice is a no-op — so
# rerunning on every container start is safe and means a fresh DB
# converges without an extra `docker compose run` command.
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa develop"]
