import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Database = NeonDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseExecutor = Database | DatabaseTransaction;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for server database access");
  }
  return value;
}

/**
 * Neon WebSocket connections must be opened and closed inside the request that
 * uses them. This also gives order-writing services an interactive transaction.
 */
export async function withDatabase<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: databaseUrl() });
  const db = drizzle({ client: pool, schema });

  try {
    return await work(db);
  } finally {
    await pool.end();
  }
}
