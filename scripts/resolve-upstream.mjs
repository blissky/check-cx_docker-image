import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function latestTag(refs) {
  const entries = refs.trim().split(/\r?\n/).map((line) => line.split(/\s+/));
  const tags = entries.flatMap(([sha, ref]) => {
    const match = /^refs\/tags\/(v(\d+)\.(\d+)\.(\d+))$/.exec(ref ?? '');
    if (!match || !/^[a-f0-9]{40}$/.test(sha)) return [];
    return [{ tag: match[1], version: match[1].slice(1), sha, parts: match.slice(2).map(Number), ref }];
  });
  tags.sort((a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]);
  if (!tags.length) throw new Error('No stable vMAJOR.MINOR.PATCH upstream tag found.');
  const chosen = tags[0];
  // ls-remote prints annotated tag objects separately from their peeled commits.
  chosen.sha = entries.find(([, ref]) => ref === `${chosen.ref}^{}`)?.[0] ?? chosen.sha;
  return { tag: chosen.tag, version: chosen.version, sha: chosen.sha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resolve = (repository) => latestTag(execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repository}.git`], { encoding: 'utf8' }));
  const panel = resolve('BingZi-233/check-cx');
  const admin = resolve('BingZi-233/check-cx-admin');
  const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const build = createHash('sha256').update(`${panel.sha}\n${admin.sha}\n${revision}`).digest('hex').slice(0, 20);
  const output = {
    panel_tag: panel.tag, panel_version: panel.version, panel_sha: panel.sha,
    admin_tag: admin.tag, admin_sha: admin.sha, build_tag: `build-${build}`,
  };
  console.log(JSON.stringify(output, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
}
