#!/usr/bin/env sh
# Production start script — all steps are idempotent.
set -e

# ── 1. Ensure database exists ─────────────────────────────────────────────────
sh scripts/ensure-db.sh

# ── 2. Run migrations ─────────────────────────────────────────────────────────
medusa db:migrate

# ── 3. Ensure admin user exists ───────────────────────────────────────────────
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

# ── 4. Start server ───────────────────────────────────────────────────────────
exec medusa start
