import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [app, target] = process.argv.slice(2);
if (!['panel', 'admin'].includes(app) || !target) {
  throw new Error('Pass panel or admin and its upstream source directory.');
}

function replace(path, before, after = '') {
  const file = join(target, path);
  const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (source.split(before).length !== 2) throw new Error(`Upstream changed; review branding patch: ${path}`);
  writeFileSync(file, source.replace(before, after));
}

if (app === 'panel') {
  replace('app/layout.tsx', 'title: "LINUX DO - 模型中转状态检测"', 'title: "Check CX - 模型中转状态检测"');
  replace('app/layout.tsx', `  icons: {
    icon: "/favicon.png",
  },
`);
  replace('components/dashboard-view.tsx', 'import Image from "next/image";\n');
  replace('components/dashboard-view.tsx', '  ArrowLeft,\n');
  replace('components/dashboard-view.tsx', `            <Image
              src="/favicon.png"
              alt="Check CX"
              width={32}
              height={32}
              priority
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
            />
`);
  replace('components/dashboard-view.tsx', `            <Link
              href="https://linux.do"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:ml-0"
            >
              <ArrowLeft className="h-3 w-3" />
              Linux.do
            </Link>
`);
  // Remove both copies so the old community icon is not shipped in the image.
  unlinkSync(join(target, 'public/favicon.png'));
  unlinkSync(join(target, 'app/favicon.png'));
} else {
  replace('components/nav-user.tsx', '  HomeIcon,\n');
  replace('components/nav-user.tsx', `              <DropdownMenuItem render={<Link href="https://check.linux.do" target="_blank" />}>
                <HomeIcon />
                前台站点
              </DropdownMenuItem>
`);
}
