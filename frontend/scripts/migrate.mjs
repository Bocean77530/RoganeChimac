import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run database migrations");
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.info("Database migrations completed");
} finally {
  await pool.end();
}
