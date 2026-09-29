import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function signToken(role, secret, now = Math.floor(Date.now() / 1000)) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    role, iss: 'check-cx', iat: now, exp: now + 10 * 365 * 86400,
  })}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function loadSecrets(directory) {
  const file = `${directory}/secrets.json`;
  if (!existsSync(file)) {
    if (existsSync(`${directory}/postgres/PG_VERSION`)) {
      throw new Error('Existing database has no secrets.json. Restore it from the same backup.');
    }
    const secrets = Object.fromEntries(
      ['jwt', 'restPassword', 'authPassword'].map((name) => [name, randomBytes(32).toString('hex')]),
    );
    writeFileSync(file, `${JSON.stringify(secrets)}\n`, { mode: 0o600, flag: 'wx' });
  }
  const secrets = JSON.parse(readFileSync(file, 'utf8'));
  for (const name of ['jwt', 'restPassword', 'authPassword']) {
    if (!/^[a-f0-9]{64}$/.test(secrets[name] ?? '')) throw new Error(`Invalid saved secret: ${name}`);
  }
  return secrets;
}

function origin(value, name) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP(S) origin without a path or credentials.`);
  }
  return url.origin;
}

export function environment(secrets, input) {
  const appUrl = origin(input.APP_URL || 'http://localhost:3001', 'APP_URL');
  const email = (input.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  if (!input.ADMIN_PASSWORD || input.ADMIN_PASSWORD.length < 12) throw new Error('Set ADMIN_PASSWORD to at least 12 characters in docker-compose.yml.');
  const internalUrl = 'http://127.0.0.1:8000';
  return {
    APP_URL: appUrl,
    ADMIN_EMAIL: email,
    ADMIN_EMAILS: email,
    SUPABASE_URL: internalUrl,
    SUPABASE_PUBLISHABLE_OR_ANON_KEY: signToken('anon', secrets.jwt),
    SUPABASE_SERVICE_ROLE_KEY: signToken('service_role', secrets.jwt),
    SUPABASE_DB_SCHEMA: 'public',
    PGRST_DB_URI: `postgres://authenticator:${secrets.restPassword}@127.0.0.1:5432/postgres`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: secrets.jwt,
    PGRST_SERVER_HOST: '127.0.0.1',
    PGRST_SERVER_PORT: '3002',
    PGRST_ADMIN_SERVER_HOST: '127.0.0.1',
    PGRST_ADMIN_SERVER_PORT: '3003',
    GOTRUE_API_HOST: '127.0.0.1',
    GOTRUE_API_PORT: '9999',
    API_EXTERNAL_URL: `${internalUrl}/auth/v1`,
    GOTRUE_SITE_URL: appUrl,
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${secrets.authPassword}@127.0.0.1:5432/postgres`,
    GOTRUE_DB_MIGRATIONS_PATH: '/usr/local/etc/auth/migrations',
    GOTRUE_JWT_SECRET: secrets.jwt,
    GOTRUE_JWT_ISSUER: `${internalUrl}/auth/v1`,
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_PASSWORD_MIN_LENGTH: '12',
    GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
    GOTRUE_EXTERNAL_GITHUB_ENABLED: 'false',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = environment(loadSecrets('/data'), process.env);
  writeFileSync('/run/check-cx/environment', Object.entries(values)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`).join('\n') + '\n', { mode: 0o600 });
}
