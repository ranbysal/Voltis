import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

let database: ReturnType<typeof drizzle> | null = null;
let schemaReady: Promise<void> | null = null;

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!database) {
    database = drizzle(neon(process.env.DATABASE_URL));
  }

  return database;
}

/**
 * Ensure the trading tables exist. Runs once per server instance so a fresh
 * deploy works without a manual migration step (idempotent IF NOT EXISTS DDL;
 * the drizzle migration files remain the source of truth for the schema).
 */
export async function ensureTradingSchema() {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  if (!schemaReady) {
    const sql = neon(process.env.DATABASE_URL);
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS account_connections (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          firm text NOT NULL,
          username text NOT NULL,
          secret text NOT NULL,
          environment text NOT NULL,
          connected_at timestamptz NOT NULL DEFAULT now(),
          last_sync_at timestamptz NOT NULL DEFAULT now()
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS trades (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          family text NOT NULL,
          symbol text NOT NULL,
          contract text NOT NULL,
          side text NOT NULL,
          quantity integer NOT NULL,
          entry_price double precision NOT NULL,
          take_profit double precision,
          stop_loss double precision,
          mode text NOT NULL,
          status text NOT NULL DEFAULT 'open',
          provider_order_id text,
          opened_at timestamptz NOT NULL DEFAULT now(),
          closed_at timestamptz
        )`;
    })();
    schemaReady.catch(() => {
      schemaReady = null; // allow a retry on the next request
    });
  }
  try {
    await schemaReady;
    return true;
  } catch {
    return false;
  }
}
