-- Postgres init script: create the second database used by the Medusa
-- commerce service alongside the primary `eb_auth` database.
--
-- Init scripts in /docker-entrypoint-initdb.d/ run EXACTLY ONCE — when
-- the postgres data directory is empty (i.e. on first volume creation).
-- They are skipped on every subsequent boot. So:
--
--   * Fresh checkout / `docker compose down -v` → this script runs and
--     the `medusa` database appears automatically.
--
--   * Existing volume → this script does NOT run. Create the database
--     manually one time:
--       docker compose exec postgres createdb -U eb_auth medusa
--
-- We deliberately use a single Postgres instance with two databases
-- (rather than a separate postgres container) so dev resource usage
-- stays low and the two services share connection-pool tuning. Module
-- isolation is preserved at the database level — Medusa runs its own
-- migrations on its own database and never sees `eb_auth`'s tables.

SELECT 'CREATE DATABASE medusa OWNER eb_auth'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'medusa')\gexec
