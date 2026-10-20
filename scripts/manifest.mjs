import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROOT_FILES = [
  'package.json',
  'tsconfig.json',
  'tailwind.config.js',
  'postcss.config.js',
  'index.html',
  'appdeploy.auth-login.json',
  'tests/tests.txt',
];
const DIRS = ['src', 'public', 'backend'];
const SKIP = new Set(['realtime.ts', 'realtime-subscribers.ts']); // template files, already in the baseline

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = [];
for (const rel of ROOT_FILES) {
  if (fs.existsSync(rel)) files.push({ filename: rel.replace(/\\/g, '/'), content: fs.readFileSync(rel, 'utf8') });
}
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const full of walk(dir)) {
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (SKIP.has(path.basename(full))) continue;
    files.push({ filename: rel, content: fs.readFileSync(full, 'utf8') });
  }
}

const manifest = { files, deletePaths: [] };
fs.writeFileSync('scripts/payload.json', JSON.stringify(manifest));
const bytes = Buffer.byteLength(JSON.stringify(manifest));
console.log(`${files.length} files, ${(bytes / 1024).toFixed(0)} kB`);
console.log(files.map(f => f.filename).join('\n'));
