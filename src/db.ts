import pg from "pg";
import { logger } from "./logger.js";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  logger.error(err, "Unexpected PostgreSQL pool error");
});
