// Builds the deploy manifest from the local tree and PUTs it to AppDeploy.
// Only app sources are sent — never node_modules, dist, scripts or local tooling.
import { readFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const uploadUrl = process.argv[2];
if (!uploadUrl) throw new Error('usage: node upload.mjs <upload_url>');

// vite.config.ts must never be replaced wholesale — the template owns settings
// the platform depends on. The worker format is the only thing UloX needs.
const DIFFS = [
  {
    filename: 'vite.config.ts',
    diffs: [
      {
        from: "    base: './',\n    build: {",
        to: "    base: './',\n    worker: {\n        format: 'es',\n    },\n    build: {",
      },
    ],
  },
];

const ROOT_FILES = [
  'package.json',
  'tsconfig.json',
  'tailwind.config.js',
  'index.html',
  'tests/tests.txt',
  'backend/index.ts',
];
const DIRS = ['src', 'public'];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out;
}

// `node upload.mjs <url> a/b.tsx c/d.ts` sends only those paths (update deploys).
const only = process.argv.slice(3);
let files = [...ROOT_FILES];
for (const dir of DIRS) files.push(...(await walk(dir)));
if (only.length) files = only;

const manifest = {
  files: [
    ...files.map(filename => {
      const abs = join(ROOT, filename.split('/').join(sep));
      statSync(abs);
      return { filename, content: readFileSync(abs, 'utf8') };
    }),
    ...(only.length ? [] : DIFFS),
  ],
  deletePaths: [],
};

const form = new FormData();
form.append('payload', new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'manifest.json');

const res = await fetch(uploadUrl, { method: 'PUT', body: form });
const text = await res.text();
console.log(res.status, text.slice(0, 500));
console.log(`\nsent ${manifest.files.length} files:`);
for (const f of manifest.files) console.log(`  ${f.filename} (${f.content ? `${f.content.length} bytes` : `${f.diffs.length} diff(s)`})`);
if (!res.ok) process.exitCode = 1;
