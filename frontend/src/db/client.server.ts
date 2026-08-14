import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseExecutor = Database | DatabaseTransaction;

let pool: Pool | undefined;
let database: Database | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for server database access");
  }
  return value;
}

export async function withDatabase<T>(work: (db: Database) => Promise<T>): Promise<T> {
  return work(getDatabase());
}

/** Close the shared pool in one-off scripts and graceful-shutdown hooks. */
export async function closeDatabase(): Promise<void> {
  const currentPool = pool;
  pool = undefined;
  database = undefined;
  if (currentPool) await currentPool.end();
}

function getDatabase(): Database {
  if (database) return database;

  pool = new Pool({
    connectionString: databaseUrl(),
    max: positiveIntegerEnv("DATABASE_POOL_MAX", 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    console.error("Unexpected idle PostgreSQL connection error", {
      message: error.message,
    });
  });
  database = drizzle({ client: pool, schema });
  return database;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
