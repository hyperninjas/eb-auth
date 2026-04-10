#!/usr/bin/env sh
# Production start script — run by nixpacks.toml on every container boot.
# All steps are idempotent; re-running on restart is safe.
set -e

# ── 1. Admin build ────────────────────────────────────────────────────────────
# Nixpacks preserves .medusa/ when its build phase succeeds (fast path).
# If the file is missing (build phase failed or was skipped), build now.
if [ ! -f .medusa/server/public/index.html ]; then
  echo "Admin bundle missing — running medusa build..."
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
