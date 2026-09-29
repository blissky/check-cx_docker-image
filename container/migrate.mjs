import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadSecrets } from './configure.mjs';

const sqlQuote = (value) => `'${value.replaceAll("'", "''")}'`;
const readSql = (path) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');

export function readMigrations(directory) {
  return readdirSync(directory).filter((name) => /^\d{14}_[\w-]+\.sql$/.test(name) && !name.endsWith('_dev.sql'))
    .sort().map((name) => {
      const sql = readSql(`${directory}/${name}`);
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

export function pendingMigrations(files, applied) {
  const current = new Map(files.map((file) => [file.name, file]));
  const previous = new Map(applied.map((file) => [file.name, file.checksum]));
  for (const [name, checksum] of previous) {
    if (!current.has(name)) throw new Error(`Missing applied migration ${name}; downgrade is not supported.`);
    if (current.get(name).checksum !== checksum) throw new Error(`Previously applied migration changed: ${name}`);
  }
  const last = [...previous.keys()].sort().at(-1);
  return files.filter((file) => !previous.has(file.name)).map((file) => {
    if (last && file.name < last) throw new Error(`New migration predates applied history: ${file.name}`);
    // psql owns the transaction so schema changes and the ledger commit together.
    if (/^\s*(?:BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK)\s*;/im.test(file.sql)) {
      throw new Error(`Migration contains transaction control; manual review required: ${file.name}`);
    }
    return file;
  });
}

function psql(sql, transaction = false) {
  return execFileSync('gosu', ['postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-f', '-',
    ...(transaction ? ['--single-transaction'] : [])], {
    input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'],
  }).trim();
}

function record(file) {
  return `INSERT INTO check_cx_image.migrations (name, checksum) VALUES (${sqlQuote(file.name)}, ${sqlQuote(file.checksum)});`;
}

function bootstrap(secrets) {
  psql(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin LOGIN; END IF;
END $$;
ALTER ROLE authenticator PASSWORD ${sqlQuote(secrets.restPassword)};
ALTER ROLE supabase_auth_admin PASSWORD ${sqlQuote(secrets.authPassword)};
GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path TO auth, public, extensions;
`, true);
}

export function migrate(source = '/opt/check-cx/supabase') {
  bootstrap(loadSecrets('/data'));
  const files = readMigrations(`${source}/migrations`);
  const permissions = readSql(new URL('./permissions.sql', import.meta.url));
  const initialized = psql("SELECT to_regclass('check_cx_image.migrations') IS NOT NULL;") === 't';
  if (!initialized) {
    if (psql("SELECT to_regclass('public.check_configs') IS NOT NULL;") === 't') {
      throw new Error('Unmanaged existing database: migrate/import explicitly instead of guessing its schema version.');
    }
    // The upstream schema is a complete snapshot. Historical migrations are baselined, not replayed.
    psql(`CREATE SCHEMA check_cx_image;
CREATE TABLE check_cx_image.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
${readSql(`${source}/schema.sql`)}
${permissions}
${files.map(record).join('\n')}`, true);
    console.log(`[check-cx] Initialized schema; recorded ${files.length} baseline migrations.`);
    return;
  }
  const applied = JSON.parse(psql("SELECT coalesce(json_agg(m), '[]'::json) FROM check_cx_image.migrations m;"));
  const pending = pendingMigrations(files, applied);
  for (const file of pending) {
    psql(`${file.sql}\n${permissions}\n${record(file)}`, true);
    console.log(`[check-cx] Applied ${file.name}`);
  }
  psql(permissions, true);
  console.log(`[check-cx] Database ready; ${pending.length} new migrations.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) migrate();
