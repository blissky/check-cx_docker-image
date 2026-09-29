import { execFileSync } from 'node:child_process';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
const literal = `'${email.replaceAll("'", "''")}'`;
const id = execFileSync('gosu', ['postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At'], {
  input: `SELECT id FROM auth.users WHERE lower(email) = ${literal};`, encoding: 'utf8',
}).trim();
if (id && !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Ambiguous administrator account.');
const response = await fetch(`http://127.0.0.1:9999/admin/users${id ? `/${id}` : ''}`, {
  method: id ? 'PUT' : 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, email_confirm: true }),
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) {
  // Do not log requests or passwords.
  throw new Error(`Administrator initialization failed (Auth HTTP ${response.status}).`);
}
console.log(`[check-cx] Administrator ${id ? 'password synchronized' : 'created'}.`);
