import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _vercelSchemaReady: Promise<void> | undefined;
}

function resolveExternalDatabaseUrl(): string | undefined {
  const directCandidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.STORAGE_DATABASE_URL,
    process.env.STORAGE_POSTGRES_URL,
    process.env.STORAGE_URL,
  ];

  for (const candidate of directCandidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (
      key.endsWith('_URL') &&
      typeof value === 'string' &&
      (value.startsWith('postgres://') || value.startsWith('postgresql://'))
    ) {
      return value.trim();
    }
  }

  return undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.SQL_HOST || resolveExternalDatabaseUrl());
}

export const createPool = () => {
  if (!global._postgresPool) {
    if (process.env.SQL_HOST) {
      // AI Studio Cloud SQL Object Method
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    } else {
      // Standard PostgreSQL connection string (Vercel Storage / Neon / Supabase)
      const connectionString = resolveExternalDatabaseUrl();
      const isLocal =
        !connectionString ||
        connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1');

      global._postgresPool = new Pool({
        connectionString,
        ssl: isLocal ? undefined : { rejectUnauthorized: false },
        max: 5,
        connectionTimeoutMillis: 15000,
      });
    }

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });

/**
 * Ensures tables exist when connecting to a fresh external PostgreSQL database
 * (e.g., Neon / Supabase / Vercel Postgres) where Drizzle Kit has not been run yet.
 * Skipped automatically when running on AI Studio Cloud SQL (managed by Drizzle Kit).
 */
export async function ensureExternalSchema(): Promise<void> {
  if (process.env.SQL_HOST) return;
  if (!isDatabaseConfigured()) return;

  if (!global._vercelSchemaReady) {
    global._vercelSchemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "users" (
          "id" serial PRIMARY KEY NOT NULL,
          "uid" text NOT NULL UNIQUE,
          "username" text UNIQUE,
          "email" text NOT NULL,
          "password_hash" text,
          "role" text DEFAULT 'viewer' NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "admin_sessions" (
          "id" serial PRIMARY KEY NOT NULL,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "token_hash" text NOT NULL UNIQUE,
          "expires_at" timestamp NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "site_settings" (
          "id" serial PRIMARY KEY NOT NULL,
          "site_name" text DEFAULT 'coffee' NOT NULL,
          "footer_description" text DEFAULT 'arquivo pessoal, feito para portifolios customizados' NOT NULL,
          "contact_email" text DEFAULT 'vitorcezario1@hotmail.com' NOT NULL,
          "footer_credit" text DEFAULT 'feito por vitor cezario' NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );
        CREATE TABLE IF NOT EXISTS "portfolio_items" (
          "id" serial PRIMARY KEY NOT NULL,
          "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "title" text DEFAULT '' NOT NULL,
          "kind" text NOT NULL,
          "aspect" text DEFAULT 'portrait' NOT NULL,
          "mime_type" text NOT NULL,
          "file_data" text NOT NULL,
          "duration" text,
          "sort_order" integer DEFAULT 0 NOT NULL,
          "published" boolean DEFAULT true NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        );
      `);
    })().catch((err) => {
      global._vercelSchemaReady = undefined;
      throw err;
    });
  }

  await global._vercelSchemaReady;
}
