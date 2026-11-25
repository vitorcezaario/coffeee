import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _externalSchemaReady: Promise<void> | undefined;
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
  return Boolean(resolveExternalDatabaseUrl() || process.env.SQL_HOST);
}

export const createPool = () => {
  if (!global._postgresPool) {
    const externalUrl = resolveExternalDatabaseUrl();

    if (externalUrl) {
      // Shared external PostgreSQL (Vercel Storage / Neon / Supabase)
      // Takes priority when configured so AI Studio preview and Vercel share one DB
      const isLocal =
        externalUrl.includes('localhost') || externalUrl.includes('127.0.0.1');

      global._postgresPool = new Pool({
        connectionString: externalUrl,
        ssl: isLocal ? undefined : { rejectUnauthorized: false },
        max: 5,
        connectionTimeoutMillis: 25000,
      });
    } else {
      // AI Studio Cloud SQL Object Method fallback
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
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
 * Ensures tables exist when connecting to an external PostgreSQL database
 * (e.g., Neon / Supabase / Vercel Postgres) where Drizzle Kit has not been run yet.
 */
export async function ensureExternalSchema(): Promise<void> {
  if (!resolveExternalDatabaseUrl()) return;

  if (!global._externalSchemaReady) {
    global._externalSchemaReady = (async () => {
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
          "display_width" integer,
          "display_height" integer,
          "pos_x" real,
          "pos_y" integer,
          "z_index" integer DEFAULT 1 NOT NULL,
          "sort_order" integer DEFAULT 0 NOT NULL,
          "published" boolean DEFAULT true NOT NULL,
          "created_at" timestamp DEFAULT now() NOT NULL
        );
        ALTER TABLE "portfolio_items" ADD COLUMN IF NOT EXISTS "display_width" integer;
        ALTER TABLE "portfolio_items" ADD COLUMN IF NOT EXISTS "display_height" integer;
        ALTER TABLE "portfolio_items" ADD COLUMN IF NOT EXISTS "pos_x" real;
        ALTER TABLE "portfolio_items" ADD COLUMN IF NOT EXISTS "pos_y" integer;
        ALTER TABLE "portfolio_items" ADD COLUMN IF NOT EXISTS "z_index" integer DEFAULT 1 NOT NULL;
      `);
    })().catch((err) => {
      global._externalSchemaReady = undefined;
      throw err;
    });
  }

  await global._externalSchemaReady;
}
