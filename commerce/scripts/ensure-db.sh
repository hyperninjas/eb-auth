#!/usr/bin/env sh
# Ensures the Medusa database exists before migrations run.
# `medusa db:migrate` (and Prisma) expect the database to already exist —
# they will crash on first boot if it isn't there. This script creates it
# once and is a no-op on every subsequent deploy.
#
# Requires: psql (postgresql nix package, added in nixpacks.toml setup phase)
# Env:      DATABASE_URL — standard postgres connection string

set -e

# Strip the scheme and extract user:pass@host:port/dbname
# Works for postgresql:// and postgres:// prefixes.
STRIPPED="${DATABASE_URL#postgresql://}"
STRIPPED="${STRIPPED#postgres://}"

# user:pass@host:port/dbname  →  split on last /
USERHOST="${STRIPPED%/*}"
DB_NAME="${STRIPPED##*/}"
# Strip any query-string params (e.g. ?sslmode=require)
DB_NAME="${DB_NAME%%\?*}"

# Connect to the maintenance database on the same host/user to run CREATE.
# The maintenance db is always named "postgres" on a standard Postgres install.
ADMIN_URL="postgresql://${USERHOST}/postgres"

echo "ensuring database \"${DB_NAME}\" exists..."
psql "$ADMIN_URL" -c "CREATE DATABASE \"${DB_NAME}\"" 2>/dev/null \
  && echo "database \"${DB_NAME}\" created." \
  || echo "database \"${DB_NAME}\" already exists, skipping."
