#!/usr/bin/env sh
# Production start script — run by nixpacks.toml on every container boot.
# All steps are idempotent; re-running on restart is safe.
set -e

# ── 1. Restore admin build ────────────────────────────────────────────────────
# nixpacks.toml copies .medusa/server to /medusa-server during the build phase
# (outside /app so it survives Nixpacks' final COPY . /app layer). Restore it
# here before starting the server.
if [ -d /medusa-server ]; then
  echo "Restoring admin build from /medusa-server..."
  mkdir -p .medusa
  cp -r /medusa-server .medusa/server
else
  echo "WARNING: /medusa-server not found — falling back to full medusa build (slow)..."
  NODE_OPTIONS=--max-old-space-size=2048 npm run build
fi

# ── 2. Ensure database exists ─────────────────────────────────────────────────
sh scripts/ensure-db.sh

# ── 3. Run migrations ─────────────────────────────────────────────────────────
npm run db:migrate

# ── 4. Ensure admin user exists ───────────────────────────────────────────────
# MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD must be set as secrets in
# Dokploy. If the user already exists, `medusa user` exits non-zero — we
# swallow that so the container doesn't crash on every restart after the
# first successful boot.
if [ -z "$MEDUSA_ADMIN_EMAIL" ] || [ -z "$MEDUSA_ADMIN_PASSWORD" ]; then
  echo "WARNING: MEDUSA_ADMIN_EMAIL or MEDUSA_ADMIN_PASSWORD is not set — skipping admin creation."
else
  echo "Ensuring admin user ${MEDUSA_ADMIN_EMAIL} exists..."
  npx medusa user \
    --email "$MEDUSA_ADMIN_EMAIL" \
    --password "$MEDUSA_ADMIN_PASSWORD" \
    2>/dev/null \
    && echo "Admin user created." \
    || echo "Admin user already exists, skipping."
fi

# ── 5. Start server ───────────────────────────────────────────────────────────
exec npm start
