import { pool } from "../db.js";
import { logger } from "../logger.js";

/**
 * Simple, idempotent migration runner.
 *
 * - Uses an advisory lock so only one instance runs migrations at a time
 *   (safe for multi-replica deploys).
 * - Tracks applied migrations in a `_migrations` table.
 * - Each migration runs inside its own transaction.
 */

interface Migration {
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    name: "001_create_devices",
    sql: `
      CREATE TABLE IF NOT EXISTS device (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id     VARCHAR(100) NOT NULL,
        rfid          VARCHAR(100) NOT NULL,
        mac_address   VARCHAR(17)  NOT NULL,
        name          VARCHAR(200),
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        created_by    VARCHAR(64)  NOT NULL,

        CONSTRAINT uq_device_device_id  UNIQUE (device_id),
        CONSTRAINT uq_device_rfid       UNIQUE (rfid),
        CONSTRAINT uq_device_mac        UNIQUE (mac_address)
      );

      CREATE INDEX IF NOT EXISTS idx_device_device_id  ON device (device_id);
      CREATE INDEX IF NOT EXISTS idx_device_rfid       ON device (rfid);
      CREATE INDEX IF NOT EXISTS idx_device_mac        ON device (mac_address);
    `,
  },
];

// PostgreSQL advisory lock key (arbitrary but fixed)
const LOCK_ID = 738_201;

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // Acquire advisory lock — blocks until available, released when connection returns to pool
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);

    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query<{ name: string }>(
      "SELECT name FROM _migrations ORDER BY name"
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    for (const migration of migrations) {
      if (appliedSet.has(migration.name)) {
        continue;
      }

      logger.info(`[MIGRATE] Applying: ${migration.name}`);

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO _migrations (name) VALUES ($1)",
          [migration.name]
        );
        await client.query("COMMIT");
        logger.info(`[MIGRATE] Applied:  ${migration.name}`);
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error(err, `[MIGRATE] Failed:   ${migration.name}`);
        throw err;
      }
    }

    logger.info("[MIGRATE] All migrations up to date.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    client.release();
  }
}
