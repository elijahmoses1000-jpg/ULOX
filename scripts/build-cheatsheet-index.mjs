// Regenerates backend/cheatsheet-index.ts from a local checkout of
// github.com/rohitg00/ai-engineering-from-scratch.
//
//   node scripts/build-cheatsheet-index.mjs <path-to-repo>
//
// Titles and subtitles live in YAML frontmatter across ~154 files, which is far
// too many round trips to do per request, so the index is baked at build time.

import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? path.join(process.env.TEMP ?? '/tmp', 'aiefs', 'ai-engineering-from-scratch-main');
const dir = path.join(root, 'cheatsheets');

if (!fs.existsSync(dir)) {
  console.error(`No cheatsheets directory at ${dir}`);
  console.error('Pass the repo root as the first argument.');
  process.exit(1);
}

const entries = [];
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.md') || file === 'AUTHORING.md') continue;
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!front) {
    console.warn(`skipped (no frontmatter): ${file}`);
    continue;
  }
  const fm = {};
  for (const line of front[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  entries.push({
    id: fm.id || file.replace(/\.md$/, ''),
    title: fm.title || '',
    sub: (fm.subtitle || '').slice(0, 150),
  });
}

entries.sort((a, b) => a.id.localeCompare(b.id));
const esc = s => JSON.stringify(String(s || ''));

const out = `// Generated index of the ai-engineering-from-scratch cheatsheets.
//
// The titles and subtitles live in YAML frontmatter inside ${entries.length} separate files,
// which is far too many round trips to do per request. The index is baked; the
// body of each sheet is still read live from GitHub when someone opens it, and
// any sheet added upstream is picked up from the directory listing and shown
// with a title derived from its filename until this list is regenerated.
//
// Regenerate: scripts/build-cheatsheet-index.mjs

/** [id, title, subtitle] */
export const CHEATSHEET_INDEX: Array<[string, string, string]> = [
${entries.map(c => `    [${esc(c.id)}, ${esc(c.title)}, ${esc(c.sub)}],`).join('\n')}
];
`;

fs.writeFileSync(path.join('backend', 'cheatsheet-index.ts'), out);
console.log(`wrote backend/cheatsheet-index.ts — ${entries.length} entries`);
