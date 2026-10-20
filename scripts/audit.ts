// End-to-end consistency audit.
//
// These are the seams where two files have to agree and nothing in the type
// system forces them to: the backend's puzzle deal vs the client's tactic set,
// every api.* call vs the routes that actually exist, every <Link> vs the router,
// every realtime entity name, and every content cross-reference.

import fs from 'node:fs';
import path from 'node:path';
import { PUZZLES, PUZZLE_BY_ID } from '../src/lib/puzzles';
import { ALL_TOPICS, ROADMAPS, TOPIC_BY_ID } from '../src/lib/curriculum';
import { PATTERN_BY_ID } from '../src/lib/patterns';
import { STAGES } from '../src/lib/journey';
import { CHEATSHEET_INDEX } from '../backend/cheatsheet-index';
import { STAGE_REQUIREMENTS } from '../backend/certificates';

const problems: string[] = [];
const notes: string[] = [];
const fail = (m: string) => problems.push(m);
const ok = (m: string) => notes.push(m);

const read = (p: string) => fs.readFileSync(p, 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const frontendFiles = walk('src');
const frontendSrc = new Map(frontendFiles.map(f => [f.replace(/\\/g, '/'), read(f)]));
const backendSrc = ['backend/index.ts', 'backend/live.ts', 'backend/roadmaps.ts']
  .filter(f => fs.existsSync(f))
  .map(f => [f, read(f)] as const);
const backendAll = backendSrc.map(([, s]) => s).join('\n');

// --- 1. Multiplayer deal: backend puzzle ids vs the shipped tactic set --------
const dealBlock = /const PUZZLE_IDS = \[([\s\S]*?)\];/.exec(read('backend/index.ts'));
if (!dealBlock) fail('backend/index.ts: PUZZLE_IDS block not found');
else {
  const backendIds = Array.from(dealBlock[1].matchAll(/"([^"]+)"/g)).map(m => m[1]);
  const clientIds = PUZZLES.map(p => p.id);
  const missingInBackend = clientIds.filter(id => !backendIds.includes(id));
  const unknownInClient = backendIds.filter(id => !clientIds.includes(id));
  if (unknownInClient.length)
    fail(`backend deals puzzle ids the client cannot resolve (blank board in a match): ${unknownInClient.join(', ')}`);
  if (missingInBackend.length)
    fail(`tactics never dealt in multiplayer: ${missingInBackend.join(', ')}`);
  if (!unknownInClient.length && !missingInBackend.length)
    ok(`multiplayer deal is in sync (${backendIds.length} tactics)`);
}

// --- 2. Every api.* call has a backend route ---------------------------------
const declaredRoutes = Array.from(backendAll.matchAll(/"(GET|POST|PUT|DELETE) (\/api\/[^"]*)"/g)).map(m => ({
  method: m[1],
  route: m[2],
}));
// Platform-provided routes the app does not declare itself.
const PLATFORM_ROUTES = [
  { method: 'POST', route: '/api/subscriptions' },
  { method: 'POST', route: '/api/subscriptions/remove' },
];
const allRoutes = [...declaredRoutes, ...PLATFORM_ROUTES];

/**
 * An interpolation glued onto the end of the last segment (no slash before it)
 * is a query string or suffix, not a new path segment — try both readings.
 */
const candidates = (url: string) => (/[^/]X$/.test(url) ? [url, url.slice(0, -1)] : [url]);

const routeMatches = (method: string, url: string) =>
  allRoutes.some(r => {
    if (r.method !== method) return false;
    const pattern = new RegExp(`^${r.route.replace(/:[^/]+/g, '[^/]+')}$`);
    return candidates(url).some(u => pattern.test(u));
  });

const callsSeen = new Set<string>();
for (const [file, src] of frontendSrc) {
  // `api` and `.get(` are often on separate lines in a promise chain, and a
  // template literal can contain quotes inside its ${...} expressions, so read
  // to the closing backtick rather than the first quote of any kind.
  for (const m of src.matchAll(/\bapi\s*\.\s*(get|post|put|delete)\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
    const method = m[1].toUpperCase();
    const literal = m[2].slice(1, -1);
    // Normalise interpolations first, then strip any query string.
    const url = literal.replace(/\$\{[^}]*\}/g, 'X').split('?')[0];
    const key = `${method} ${url}`;
    callsSeen.add(key);
    if (!routeMatches(method, url)) fail(`${file}: calls ${key} but no backend route matches`);
  }
}
ok(`${callsSeen.size} distinct api calls checked against ${declaredRoutes.length} declared routes`);

// Backend routes nothing calls (excluding the healthcheck the platform pings).
const called = Array.from(callsSeen).map(k => {
  const [method, url] = k.split(' ');
  return { method, url };
});
let operatorRoutes = 0;
for (const r of declaredRoutes) {
  if (r.route === '/api/_healthcheck') continue;
  // /api/admin/* is deliberately unreachable from the app: these are operator
  // tools driven by hand with the ULOX_ADMIN_TOKEN secret. Exempt them from the
  // dead-endpoint rule, but keep them under the opposite rule — a frontend call
  // to a route that does not exist is still a failure.
  if (r.route.startsWith('/api/admin/')) {
    operatorRoutes += 1;
    continue;
  }
  const pattern = new RegExp(`^${r.route.replace(/:[^/]+/g, '[^/]+')}$`);
  if (!called.some(c => c.method === r.method && candidates(c.url).some(u => pattern.test(u)))) {
    fail(`backend route ${r.method} ${r.route} is never called by the frontend (dead endpoint)`);
  }
}
if (operatorRoutes) ok(`${operatorRoutes} operator route(s) under /api/admin exempt from the dead-endpoint rule`);

// An operator route that forgot its gate would be an open door, so prove every
// one of them runs adminGate before it does anything.
{
  const backend = read('backend/index.ts');
  for (const r of declaredRoutes.filter(d => d.route.startsWith('/api/admin/'))) {
    const key = `"${r.method} ${r.route}"`;
    const at = backend.indexOf(key);
    const body = at === -1 ? '' : backend.slice(at, at + 700);
    if (!body.includes('adminGate')) fail(`operator route ${r.method} ${r.route} does not call adminGate`);
  }
  ok('every /api/admin route is behind adminGate');
}

// --- 3. Router: every internal link resolves ---------------------------------
const appSrc = read('src/App.tsx');
const routePaths = Array.from(appSrc.matchAll(/<Route\s+path="([^"]+)"/g)).map(m => m[1]);
const routeRegexes = routePaths
  .filter(p => p !== '*')
  .map(p => new RegExp(`^${p.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')}$`));

const linkTargets = new Set<string>();
for (const [file, src] of frontendSrc) {
  const patterns = [/\bto=\{?[`'"](\/[^`'"?{}]*)/g, /navigate\(\s*[`'"](\/[^`'"?]*)/g];
  for (const pattern of patterns) {
    for (const m of src.matchAll(pattern)) {
      const raw = m[1].replace(/\$\{[^}]*\}/g, 'X');
      const clean = raw.replace(/\/$/, '') || '/';
      linkTargets.add(clean);
      if (!routeRegexes.some(rx => rx.test(clean))) fail(`${file}: links to "${clean}" but no route matches`);
    }
  }
}
ok(`${linkTargets.size} internal link targets checked against ${routePaths.length} routes`);

// --- 4. Realtime entity names agree across the wire --------------------------
const feEntities = new Set<string>();
for (const [, src] of frontendSrc) {
  for (const m of src.matchAll(/entity_type:\s*'([^']+)'/g)) feEntities.add(m[1]);
  for (const m of src.matchAll(/entity_type\s*!==\s*'([^']+)'/g)) feEntities.add(m[1]);
}
const beEntities = new Set(Array.from(backendAll.matchAll(/notifySubscribers\(\s*"?([a-zA-Z_]+)"?/g)).map(m => m[1]));
// Backend uses a constant for the lobby; resolve it.
const lobbyConst = /LOBBY_ENTITY = "([^"]+)"/.exec(backendAll);
if (lobbyConst) {
  beEntities.delete('LOBBY_ENTITY');
  beEntities.add(lobbyConst[1]);
}
for (const entity of feEntities) {
  if (!beEntities.has(entity)) fail(`frontend subscribes to realtime entity "${entity}" that the backend never notifies`);
}
for (const entity of beEntities) {
  if (!feEntities.has(entity)) fail(`backend notifies realtime entity "${entity}" that no frontend view subscribes to`);
}
ok(`realtime entities agree: ${Array.from(feEntities).sort().join(', ')}`);

// --- 5. Content cross-references ---------------------------------------------
for (const puzzle of PUZZLES) {
  for (const topicId of puzzle.topics) {
    if (!TOPIC_BY_ID.has(topicId)) fail(`puzzle ${puzzle.id} references unknown topic "${topicId}"`);
  }
}
for (const topic of ALL_TOPICS) {
  for (const pid of topic.puzzles) {
    if (!PUZZLE_BY_ID.has(pid)) fail(`topic ${topic.id} references unknown puzzle "${pid}"`);
  }
  if (topic.preset && topic.preset !== 'blank' && !PATTERN_BY_ID.has(topic.preset)) {
    fail(`topic ${topic.id} references unknown Lab preset "${topic.preset}"`);
  }
}
ok(`${PUZZLES.length} tactics and ${ALL_TOPICS.length} curated topics cross-reference cleanly`);

// --- 5b. The journey spine ----------------------------------------------------
// Every tactic must sit in exactly one stage, and every stage must point at
// topics and drills that actually exist. If this drifts, "your next step" sends
// people at a dead link, which is the one thing it must never do.
{
  const seenDrills = new Map<string, string>();
  for (const stage of STAGES) {
    for (const topicId of stage.topics) {
      if (!TOPIC_BY_ID.has(topicId)) fail(`journey stage "${stage.id}" reads unknown topic "${topicId}"`);
    }
    for (const drillId of stage.drills) {
      if (!PUZZLE_BY_ID.has(drillId)) fail(`journey stage "${stage.id}" drills unknown tactic "${drillId}"`);
      const owner = seenDrills.get(drillId);
      if (owner) fail(`tactic ${drillId} is claimed by both "${owner}" and "${stage.id}"`);
      seenDrills.set(drillId, stage.id);
    }
    if (!PATTERN_BY_ID.has(stage.build) && stage.build !== 'blank') {
      fail(`journey stage "${stage.id}" builds unknown preset "${stage.build}"`);
    }
  }
  const unplaced = PUZZLES.filter(p => !seenDrills.has(p.id));
  if (unplaced.length) fail(`tactics not placed in any journey stage: ${unplaced.map(p => p.id).join(', ')}`);

  const numbers = STAGES.map(s => s.n).join(',');
  const expected = STAGES.map((_, i) => i + 1).join(',');
  if (numbers !== expected) fail(`journey stage numbers are ${numbers}, expected ${expected}`);

  if (!problems.length) ok(`journey: ${STAGES.length} stages, all ${PUZZLES.length} tactics placed exactly once`);
}

// --- 5c. Field notes resolve --------------------------------------------------
// Every cheatsheet a stage links to must exist in the generated index, or the
// learner gets a 404 on GitHub. Regenerate the index when upstream renames one.
{
  const known = new Set(CHEATSHEET_INDEX.map(([id]) => id));
  const missing: string[] = [];
  for (const stage of STAGES) {
    for (const id of stage.notes) {
      if (!known.has(id)) missing.push(`${stage.id} → ${id}`);
    }
  }
  if (missing.length) fail(`field notes with no matching cheatsheet: ${missing.join(', ')}`);
  else ok(`field notes: ${STAGES.reduce((n, s) => n + s.notes.length, 0)} references resolve against ${known.size} cheatsheets`);
}

// --- 5d. Certificate requirements mirror the journey --------------------------
// The backend cannot import src/, so the requirements are duplicated there. If
// the two drift, UloX either hands out certificates nobody earned or refuses
// ones that were. Neither is acceptable for something people will show people.
{
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

  const frontendIds = STAGES.map(s => s.id).sort().join(',');
  const backendIds = Object.keys(STAGE_REQUIREMENTS).sort().join(',');
  if (frontendIds !== backendIds) {
    fail(`certificate tracks [${backendIds}] do not match journey stages [${frontendIds}]`);
  }

  for (const stage of STAGES) {
    const req = STAGE_REQUIREMENTS[stage.id];
    if (!req) continue;
    if (!sameSet(stage.topics, req.topics)) {
      fail(`certificate topics for "${stage.id}" differ from the journey stage`);
    }
    if (!sameSet(stage.drills, req.drills)) {
      fail(`certificate drills for "${stage.id}" differ from the journey stage`);
    }
    // Case deliberately differs: running UI text is sentence case, a certificate
    // is title case. What must not differ is which discipline it names.
    if (req.formal.toLowerCase() !== stage.formal.toLowerCase()) {
      fail(`certificate names "${req.formal}" for stage "${stage.id}", journey says "${stage.formal}"`);
    }
  }

  if (!problems.length) {
    ok(`certificates: ${Object.keys(STAGE_REQUIREMENTS).length} tracks mirror the journey exactly`);
  }
}

// --- 6. Every tactic is reachable from the curriculum -------------------------
const linkedPuzzles = new Set(ALL_TOPICS.flatMap(t => t.puzzles));
const orphanTactics = PUZZLES.filter(p => !linkedPuzzles.has(p.id));
if (orphanTactics.length) {
  fail(`tactics not reachable from any curriculum topic: ${orphanTactics.map(p => p.id).join(', ')}`);
} else ok('every tactic is linked from at least one curriculum topic');

// --- 7. Roadmap slugs used in the UI ------------------------------------------
const roadmapSlugs = new Set(ROADMAPS.map(r => r.slug));
for (const [file, src] of frontendSrc) {
  for (const m of src.matchAll(/\/learn\/([a-z-]+)/g)) {
    if (!roadmapSlugs.has(m[1])) fail(`${file}: links to UloX Core roadmap "${m[1]}" which does not exist`);
  }
}
ok(`${roadmapSlugs.size} UloX Core roadmaps, ${ROADMAPS.reduce((n, r) => n + r.sections.length, 0)} sections`);

// --- 8. Platform rules --------------------------------------------------------
for (const [file, src] of frontendSrc) {
  if (src.includes('@appdeploy/sdk')) fail(`${file}: frontend must never import @appdeploy/sdk`);
  if (/\bfetch\(/.test(src) && !file.includes('WorldMap')) fail(`${file}: uses fetch() instead of api.*`);
  if (/ws\.(subscribe|publish|send|onMessage)\(/.test(src)) fail(`${file}: illegal ws.* call (only ws.connect() allowed)`);
}
for (const [file, src] of backendSrc) {
  if (src.includes('@appdeploy/client')) fail(`${file}: backend must never import @appdeploy/client`);
  if (/ws\.(connect|publish|subscribe)\(/.test(src)) fail(`${file}: illegal ws.* call in backend`);
}
const pkg = JSON.parse(read('package.json'));
for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (dep.startsWith('@appdeploy/')) fail(`package.json must not list ${dep} (platform-injected)`);
}
if (!appSrc.includes('HashRouter')) fail('App.tsx must use HashRouter');
ok('platform import/router/websocket rules hold');

// --- report -------------------------------------------------------------------
console.log('\n'.padEnd(1));
for (const n of notes) console.log(`  ok   ${n}`);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  FAIL ${p}`);
  console.log(`\n${problems.length} problem(s) found`);
  process.exitCode = 1;
} else {
  console.log('\nall consistency checks passed');
}
