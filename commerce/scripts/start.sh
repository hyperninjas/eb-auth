#!/usr/bin/env sh
# Production start script — run by nixpacks.toml on every container boot.
# All steps are idempotent; re-running on restart is safe.
set -e

# ── 1. Restore build artifact ─────────────────────────────────────────────────
# /medusa-server was populated during the Nixpacks build phase (cp -r
# .medusa/server /medusa-server). It lives outside /app so it survives the
# opaque-dir COPY layer that Nixpacks appends. Restore it to the path that
# `medusa start` expects: .medusa/server relative to the project root.
echo "Restoring .medusa/server from build artifact..."
mkdir -p .medusa
cp -r /medusa-server .medusa/server

# Use the medusa CLI shipped inside the production artifact — no devDeps
# from /app/node_modules needed at runtime.
export PATH="/medusa-server/node_modules/.bin:$PATH"

# ── 2. Ensure database exists ─────────────────────────────────────────────────
sh scripts/ensure-db.sh

# ── 3. Run migrations ─────────────────────────────────────────────────────────
medusa db:migrate

# ── 4. Ensure admin user exists ───────────────────────────────────────────────
# MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD must be set as secrets in
# Dokploy. Gracefully skips if the user already exists.
if [ -z "$MEDUSA_ADMIN_EMAIL" ] || [ -z "$MEDUSA_ADMIN_PASSWORD" ]; then
  echo "WARNING: MEDUSA_ADMIN_EMAIL or MEDUSA_ADMIN_PASSWORD not set — skipping admin creation."
else
  echo "Ensuring admin user ${MEDUSA_ADMIN_EMAIL} exists..."
  medusa user \
    --email "$MEDUSA_ADMIN_EMAIL" \
    --password "$MEDUSA_ADMIN_PASSWORD" \
    2>/dev/null \
    && echo "Admin user created." \
    || echo "Admin user already exists, skipping."
fi

# ── 5. Start server ───────────────────────────────────────────────────────────
exec medusa start
