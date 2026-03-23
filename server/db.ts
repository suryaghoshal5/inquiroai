import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import pg from 'pg';
const { Pool: PgPool } = pg;
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use standard pg driver for local development (Neon driver requires WebSocket proxy)
const isLocal = process.env.DATABASE_URL.includes('localhost') ||
                process.env.DATABASE_URL.includes('127.0.0.1');

let pool: Pool | PgPool;
let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg>;

if (isLocal) {
  pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg({ client: pool as PgPool, schema });
} else {
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool as Pool, schema });
}

export { pool, db };