-- Convert Better Auth DateTime columns from `timestamp(3)` to
-- `timestamptz(3)`.
--
-- Why: The init migration created these columns as TIMESTAMP (no time zone),
-- which stores wall-clock digits with no zone information. The Postgres
-- driver was writing UTC values into them (Prisma serializes JS Date via
-- toISOString → UTC), so the existing rows ARE UTC, the column type just
-- never said so. Reading them back applies the session TZ, which silently
-- shifts values when the server's TZ ≠ UTC.
--
-- The `USING ... AT TIME ZONE 'UTC'` clause tells Postgres "treat the
-- existing wall-clock value as already being in UTC", which is the correct
-- interpretation here. WITHOUT this clause, Postgres would use the session
-- TZ (potentially the server's local zone) and shift every row by the
-- offset — silent data corruption.
--
-- Run inside a transaction so a failure on any one column rolls everything
-- back instead of leaving the schema half-converted.

BEGIN;

-- Force the conversion to interpret existing values as UTC, regardless of
-- whatever TimeZone the migration session inherits.
SET LOCAL TIME ZONE 'UTC';

-- user
ALTER TABLE "user"
  ALTER COLUMN "createdAt"  TYPE TIMESTAMPTZ(3) USING "createdAt"  AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"  TYPE TIMESTAMPTZ(3) USING "updatedAt"  AT TIME ZONE 'UTC',
  ALTER COLUMN "banExpires" TYPE TIMESTAMPTZ(3) USING "banExpires" AT TIME ZONE 'UTC';

-- session
ALTER TABLE "session"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- account
ALTER TABLE "account"
  ALTER COLUMN "accessTokenExpiresAt"  TYPE TIMESTAMPTZ(3) USING "accessTokenExpiresAt"  AT TIME ZONE 'UTC',
  ALTER COLUMN "refreshTokenExpiresAt" TYPE TIMESTAMPTZ(3) USING "refreshTokenExpiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt"             TYPE TIMESTAMPTZ(3) USING "createdAt"             AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt"             TYPE TIMESTAMPTZ(3) USING "updatedAt"             AT TIME ZONE 'UTC';

-- verification
ALTER TABLE "verification"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- jwks
ALTER TABLE "jwks"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- organization
ALTER TABLE "organization"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- member
ALTER TABLE "member"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- invitation
ALTER TABLE "invitation"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC';

COMMIT;
