import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

let database: ReturnType<typeof drizzle> | null = null;

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!database) {
    database = drizzle(neon(process.env.DATABASE_URL));
  }

  return database;
}

