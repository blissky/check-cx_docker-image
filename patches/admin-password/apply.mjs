import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Pass the upstream admin source directory.');
const directory = fileURLToPath(new URL('.', import.meta.url));
function replace(path, before, after) {
  const file = join(target, path);
  const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (source.split(before).length !== 2) throw new Error(`Upstream changed; review password patch: ${path}`);
  writeFileSync(file, source.replace(before, after));
}
// Keep the upstream allowlist and role checks; accept local email identities.
replace('lib/admin/auth.ts', 'function isGitHubIdentity(', 'function isEmailIdentity(');
replace('lib/admin/auth.ts', 'return provider === "github" || providers.includes("github")', 'return provider === "email" || providers.includes("email")');
replace('lib/admin/auth.ts', '!isGitHubIdentity(user)', '!isEmailIdentity(user)');
cpSync(join(directory, 'login-form.tsx'), join(target, 'components/login-form.tsx'));
cpSync(join(directory, 'login-page.tsx'), join(target, 'app/login/page.tsx'));
cpSync(join(directory, 'sign-in-route.ts'), join(target, 'app/auth/sign-in/route.ts'));
cpSync(join(directory, 'sign-out-route.ts'), join(target, 'app/auth/sign-out/route.ts'));
// The user directory is still the authorization allowlist, now for local email accounts.
const usersPage = join(target, 'app/dashboard/users/page.tsx');
writeFileSync(usersPage, readFileSync(usersPage, 'utf8').replaceAll('GitHub', '本地'));
