// Resource library.
//
// Five public repositories, parsed into one uniform shape so a single UI can
// render all of them, and cached in chunks because some of these lists run to
// well over a thousand entries and a single record would not fit.
//
//   public-apis            -> real APIs, which double as Tool contracts in the Lab
//   build-your-own-x       -> project-sized challenges
//   free-programming-books -> reading per language and subject
//   awesome                -> curated lists per topic
//   freeCodeCamp           -> hands-on certifications and challenge blocks

import { db } from "@appdeploy/sdk";
import { CHEATSHEET_INDEX } from "./cheatsheet-index";

const TABLE = "resource_cache";
const TTL = 7 * 24 * 60 * 60 * 1000;
const CHUNK = 300;
const OWNER = "elijahmoses1000-jpg";

export type ResourceKindId =
    | "apis"
    | "projects"
    | "books"
    | "lists"
    | "practice"
    | "cheatsheets"
    | "careers"
    | "builds";

/** github.com/rohitg00/ai-engineering-from-scratch */
const AIEFS = "rohitg00/ai-engineering-from-scratch";
const AIEFS_BRANCH = "main";

export interface ResourceItem {
    title: string;
    url: string;
    /** Section heading it came from — the category filter in the UI. */
    group: string;
    note?: string;
    /** Short badge text, e.g. auth requirements for an API. */
    meta?: string;
}

export const SOURCES: Record<ResourceKindId, { label: string; blurb: string; repo: string; credit: string }> = {
    apis: {
        label: "Live APIs",
        blurb: "Free public APIs you can wire straight into an agent as a Tool.",
        repo: "public-apis/public-apis",
        credit: "public-apis",
    },
    projects: {
        label: "Build your own",
        blurb: "Step-by-step guides to building the real thing from scratch.",
        repo: "codecrafters-io/build-your-own-x",
        credit: "build-your-own-x",
    },
    books: {
        label: "Free books",
        blurb: "Free programming books and courses, by language and subject.",
        repo: "EbookFoundation/free-programming-books",
        credit: "free-programming-books",
    },
    lists: {
        label: "Curated lists",
        blurb: "The awesome index — a hand-picked list for almost any topic.",
        repo: "sindresorhus/awesome",
        credit: "awesome",
    },
    practice: {
        label: "Practice",
        blurb: "freeCodeCamp certifications and challenge blocks you can work through.",
        repo: "freeCodeCamp/freeCodeCamp",
        credit: "freeCodeCamp",
    },
    cheatsheets: {
        label: "Field notes",
        blurb: "One-page references on agents, harnesses, graphs, evals and the rest.",
        repo: AIEFS,
        credit: "ai-engineering-from-scratch",
    },
    careers: {
        label: "Career routes",
        blurb: "Where these skills lead, with the stages and hours each route takes.",
        repo: AIEFS,
        credit: "ai-engineering-from-scratch",
    },
    builds: {
        label: "Build challenges",
        blurb: "Graded projects with stages and a time estimate, from starter to systems.",
        repo: AIEFS,
        credit: "ai-engineering-from-scratch",
    },
};

interface Candidate {
    repo: string;
    branch: string;
    /** One or more files, concatenated in order by the parser. */
    paths: string[];
}

/**
 * The owner's fork is tried first so their edits win, then the canonical
 * upstream. Pinning only to a personal fork is how three of these libraries
 * went dark the moment that account stopped being public — the upstream is not
 * a nicety, it is what keeps the shelf stocked.
 */
const CANDIDATES: Record<ResourceKindId, Candidate[]> = {
    apis: [
        { repo: `${OWNER}/public-apis`, branch: "master", paths: ["README.md"] },
        { repo: "public-apis/public-apis", branch: "master", paths: ["README.md"] },
    ],
    projects: [
        { repo: `${OWNER}/build-your-own-x`, branch: "master", paths: ["README.md"] },
        { repo: "codecrafters-io/build-your-own-x", branch: "master", paths: ["README.md"] },
    ],
    books: [
        {
            repo: `${OWNER}/free-programming-books`,
            branch: "main",
            paths: ["books/free-programming-books-langs.md", "books/free-programming-books-subjects.md"],
        },
        {
            repo: "EbookFoundation/free-programming-books",
            branch: "main",
            paths: ["books/free-programming-books-langs.md", "books/free-programming-books-subjects.md"],
        },
    ],
    lists: [
        { repo: `${OWNER}/awesome`, branch: "main", paths: ["readme.md"] },
        { repo: "sindresorhus/awesome", branch: "main", paths: ["readme.md"] },
    ],
    practice: [
        { repo: `${OWNER}/freeCodeCamp`, branch: "main", paths: ["client/i18n/locales/english/intro.json"] },
        { repo: "freeCodeCamp/freeCodeCamp", branch: "main", paths: ["client/i18n/locales/english/intro.json"] },
    ],
    cheatsheets: [{ repo: AIEFS, branch: AIEFS_BRANCH, paths: [] }],
    careers: [{ repo: AIEFS, branch: AIEFS_BRANCH, paths: [] }],
    builds: [{ repo: AIEFS, branch: AIEFS_BRANCH, paths: ["projects/README.md"] }],
};

async function fetchJson(url: string, timeoutMs = 12000): Promise<unknown | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "ulox-verionx", Accept: "application/vnd.github+json" },
        });
        if (!res.ok) {
            console.warn(`resource listing ${res.status} for ${url}`);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.warn(`resource listing failed for ${url}:`, err instanceof Error ? err.message : err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ulox-verionx" } });
        if (!res.ok) {
            console.warn(`resource fetch ${res.status} for ${url}`);
            return null;
        }
        return await res.text();
    } catch (err) {
        console.warn(`resource fetch failed for ${url}:`, err instanceof Error ? err.message : err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// --- chunked cache ----------------------------------------------------------

interface ChunkRecord {
    kind: string;
    part: number;
    items: ResourceItem[];
    fetchedAt: number;
    /** Which repository this batch actually came from. */
    repo?: string;
    v?: number;
}

/** Bump when the cached shape or the source list changes, to force a refetch. */
const CACHE_VERSION = 2;

async function loadCache(
    kind: ResourceKindId
): Promise<{ items: ResourceItem[]; fetchedAt: number; repo: string } | null> {
    const { items } = await db.list<ChunkRecord>(TABLE, { limit: 1000 });
    const mine = items
        .filter(row => row.kind === kind && (row.v ?? 1) === CACHE_VERSION)
        .sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
    if (!mine.length) return null;
    return {
        items: mine.flatMap(row => row.items ?? []),
        fetchedAt: Math.min(...mine.map(row => row.fetchedAt ?? 0)),
        repo: mine[0].repo ?? SOURCES[kind].repo,
    };
}

async function saveCache(kind: ResourceKindId, list: ResourceItem[], repo: string) {
    const { items } = await db.list<ChunkRecord>(TABLE, { limit: 1000 });
    const stale = items.filter(row => row.kind === kind).map(row => row.id);
    if (stale.length) await db.delete(TABLE, stale);

    const now = Date.now();
    const records: Array<Record<string, unknown>> = [];
    for (let part = 0; part * CHUNK < list.length; part += 1) {
        records.push({
            kind,
            part,
            repo,
            v: CACHE_VERSION,
            items: list.slice(part * CHUNK, (part + 1) * CHUNK),
            fetchedAt: now,
        });
    }
    // db.add takes a batch; keep each call modest.
    for (let i = 0; i < records.length; i += 5) {
        await db.add(TABLE, records.slice(i, i + 5));
    }
}

// --- parsers ----------------------------------------------------------------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** `| [Name](url) | Description | Auth | HTTPS | CORS |` grouped under `### Category`. */
function parseApis(md: string): ResourceItem[] {
    const out: ResourceItem[] = [];
    let group = "Other";
    for (const line of md.split("\n")) {
        const heading = /^###\s+(.+?)\s*$/.exec(line);
        if (heading) {
            group = heading[1].replace(/[*_`]/g, "").trim();
            continue;
        }
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        if (cells.length < 5) continue;
        const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(cells[0]);
        if (!link) continue;
        const auth = cells[2].replace(/`/g, "").trim();
        const cors = cells[4].replace(/`/g, "").trim();
        out.push({
            title: link[1].trim(),
            url: link[2],
            group,
            note: clip(cells[1].replace(/\|/g, " ").trim(), 140),
            meta: `${!auth || auth.toLowerCase() === "no" ? "No key needed" : auth} · CORS ${cors || "unknown"}`,
        });
    }
    return out;
}

/** `#### Build your own \`Thing\`` followed by `* [Title](url)`. */
function parseProjects(md: string): ResourceItem[] {
    const out: ResourceItem[] = [];
    let group = "Projects";
    for (const line of md.split("\n")) {
        const heading = /^####\s+Build your own\s+`?([^`]+)`?\s*$/.exec(line);
        if (heading) {
            group = heading[1].trim();
            continue;
        }
        const item = /^\s*[*-]\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(.*)$/.exec(line);
        if (!item) continue;
        const tail = item[3].replace(/[[\]()*_`]/g, " ").replace(/\s+/g, " ").trim();
        out.push({ title: clip(item[1].trim(), 110), url: item[2], group, note: tail ? clip(tail, 100) : undefined });
    }
    return out;
}

/** `### Language` followed by `* [Title](url) - Author`. */
function parseBooks(md: string, fallbackGroup: string): ResourceItem[] {
    const out: ResourceItem[] = [];
    let group = fallbackGroup;
    for (const line of md.split("\n")) {
        const heading = /^###\s+(.+?)\s*$/.exec(line);
        if (heading) {
            group = heading[1].replace(/[*_`]/g, "").trim();
            continue;
        }
        const item = /^\s*[*-]\s*\[([^\]]+)\]\(([^)\s]+)\)(.*)$/.exec(line);
        if (!item) continue;
        const url = item[2].startsWith("http") ? item[2] : `https://github.com/${OWNER}/free-programming-books/blob/main/${item[2].replace(/^\.\//, "")}`;
        const author = item[3].replace(/^[\s-]+/, "").replace(/[*_`]/g, "").trim();
        out.push({ title: clip(item[1].trim(), 110), url, group, note: author ? clip(author, 90) : undefined });
    }
    return out;
}

/** `- [Title](url) - description` under `## Section`. */
function parseAwesome(md: string): ResourceItem[] {
    const out: ResourceItem[] = [];
    let group = "Awesome";
    for (const line of md.split("\n")) {
        const heading = /^##\s+(.+?)\s*$/.exec(line);
        if (heading) {
            group = heading[1].replace(/[*_`]/g, "").trim();
            continue;
        }
        const item = /^\s*[-*]\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(.*)$/.exec(line);
        if (!item) continue;
        const note = item[3].replace(/^[\s-]+/, "").replace(/[*_`]/g, "").trim();
        out.push({ title: clip(item[1].trim(), 90), url: item[2], group, note: note ? clip(note, 110) : undefined });
    }
    return out;
}

/** freeCodeCamp's intro.json: superblock -> blocks -> { title, intro }. */
function parsePractice(json: unknown): ResourceItem[] {
    const root = (json ?? {}) as Record<string, { title?: unknown; blocks?: Record<string, { title?: unknown; intro?: unknown }> }>;
    const out: ResourceItem[] = [];
    for (const [superSlug, sup] of Object.entries(root)) {
        const superTitle = typeof sup?.title === "string" ? sup.title : superSlug;
        const blocks = sup?.blocks ?? {};
        for (const [blockSlug, block] of Object.entries(blocks)) {
            const title = typeof block?.title === "string" ? block.title : blockSlug;
            const intro = Array.isArray(block?.intro) ? block.intro.filter(x => typeof x === "string")[0] : "";
            out.push({
                title: clip(title, 110),
                url: `https://www.freecodecamp.org/learn/${superSlug}/${blockSlug}`,
                group: clip(superTitle, 70),
                note: intro ? clip(String(intro), 150) : undefined,
            });
        }
    }
    return out;
}

// --- public API -------------------------------------------------------------

function parseFor(kind: ResourceKindId, texts: string[]): ResourceItem[] {
    if (kind === "apis") return parseApis(texts[0]);
    if (kind === "projects") return parseProjects(texts[0]);
    if (kind === "books") {
        return [
            ...(texts[0] ? parseBooks(texts[0], "Languages") : []),
            ...(texts[1] ? parseBooks(texts[1], "Subjects") : []),
        ];
    }
    if (kind === "lists") return parseAwesome(texts[0]);
    try {
        return parsePractice(JSON.parse(texts[0]));
    } catch {
        return [];
    }
}

const raw = (path: string) => `https://raw.githubusercontent.com/${AIEFS}/${AIEFS_BRANCH}/${path}`;

const titleFromSlug = (slug: string) =>
    slug.split("-").map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

/** Cluster the sheets by their leading token so the filter chips mean something. */
const GROUP_NAMES: Record<string, string> = {
    agent: "Agents",
    agents: "Agents",
    llm: "LLMs",
    rag: "Retrieval",
    eval: "Evaluation",
    evals: "Evaluation",
    mcp: "MCP",
    a2a: "Agent protocols",
    prompt: "Prompting",
    context: "Context",
    data: "Data",
    model: "Models",
    vector: "Retrieval",
    safety: "Safety",
    security: "Safety",
    ai: "Foundations",
};

function cheatsheetGroup(id: string): string {
    const head = id.split("-")[0];
    return GROUP_NAMES[head] ?? "Engineering";
}

/**
 * The index is baked (154 frontmatters is far too many round trips), but we
 * still read the live directory so anything added upstream shows up rather than
 * silently going missing.
 */
async function buildCheatsheets(): Promise<ResourceItem[]> {
    const known = new Map(CHEATSHEET_INDEX.map(([id, title, sub]) => [id, { title, sub }]));

    const listing = await fetchJson(
        `https://api.github.com/repos/${AIEFS}/contents/cheatsheets`
    );
    if (Array.isArray(listing)) {
        for (const entry of listing as Array<{ type?: string; name?: string }>) {
            if (entry.type !== "file" || !entry.name?.endsWith(".md")) continue;
            if (entry.name === "AUTHORING.md") continue;
            const id = entry.name.replace(/\.md$/, "");
            if (!known.has(id)) known.set(id, { title: titleFromSlug(id), sub: "" });
        }
    }

    return Array.from(known, ([id, meta]) => ({
        title: meta.title || titleFromSlug(id),
        url: `https://github.com/${AIEFS}/blob/${AIEFS_BRANCH}/cheatsheets/${id}.md`,
        group: cheatsheetGroup(id),
        note: meta.sub || undefined,
    })).sort((a, b) => a.title.localeCompare(b.title));
}

/** Each career route is its own JSON file; the directory listing names them. */
async function buildCareers(): Promise<ResourceItem[]> {
    const listing = await fetchJson(`https://api.github.com/repos/${AIEFS}/contents/learning-paths`);
    const files = Array.isArray(listing)
        ? (listing as Array<{ type?: string; name?: string }>)
              .filter(e => e.type === "file" && e.name?.endsWith(".json"))
              .map(e => e.name as string)
        : [];
    if (!files.length) return [];

    const out: ResourceItem[] = [];
    for (const file of files.slice(0, 30)) {
        const text = await fetchText(raw(`learning-paths/${file}`));
        if (!text) continue;
        try {
            const j = JSON.parse(text) as {
                id?: string;
                title?: string;
                summary?: string;
                workFamily?: string;
                estimatedMinutes?: number;
                stages?: unknown[];
                lessons?: unknown[];
            };
            const id = j.id || file.replace(/\.json$/, "");
            const lessons = Array.isArray(j.lessons) ? j.lessons.length : 0;
            const hours = j.estimatedMinutes ? Math.round(j.estimatedMinutes / 60) : 0;
            out.push({
                title: j.title || titleFromSlug(id),
                url: `https://github.com/${AIEFS}/blob/${AIEFS_BRANCH}/learning-paths/${file}`,
                group: j.workFamily || "Career route",
                note: clip(String(j.summary ?? ""), 180),
                meta: [lessons ? `${lessons} lessons` : "", hours ? `~${hours}h` : ""].filter(Boolean).join(" · "),
            });
        } catch {
            /* skip a malformed route rather than failing the whole library */
        }
    }
    return out;
}

const LEVEL_NAMES: Record<string, string> = {
    "1": "1 · Starter",
    "2": "2 · Builder",
    "3": "3 · Engineer",
    "4": "4 · Systems",
};

/** `| [Title](slug/) | Level | Languages | Stages | Estimate |` */
function parseBuilds(md: string): ResourceItem[] {
    const out: ResourceItem[] = [];
    for (const line of md.split("\n")) {
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        if (cells.length < 5) continue;
        const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(cells[0]);
        if (!link) continue;
        const slug = link[2].replace(/\/$/, "");
        const level = cells[1].replace(/[^\d]/g, "");
        out.push({
            title: link[1].trim(),
            url: `https://github.com/${AIEFS}/tree/${AIEFS_BRANCH}/projects/${slug}`,
            group: LEVEL_NAMES[level] ?? "Projects",
            note: cells[2] ? `${cells[2]}` : undefined,
            meta: [cells[3] ? `${cells[3]} stages` : "", cells[4]].filter(Boolean).join(" · "),
        });
    }
    return out;
}

/** Try each source in turn; the first that yields real entries wins. */
async function build(kind: ResourceKindId): Promise<{ items: ResourceItem[]; repo: string }> {
    if (kind === "cheatsheets") return { items: await buildCheatsheets(), repo: AIEFS };
    if (kind === "careers") return { items: await buildCareers(), repo: AIEFS };
    if (kind === "builds") {
        const md = await fetchText(raw("projects/README.md"));
        return { items: md ? parseBuilds(md) : [], repo: AIEFS };
    }

    for (const candidate of CANDIDATES[kind]) {
        const texts = await Promise.all(
            candidate.paths.map(path =>
                fetchText(`https://raw.githubusercontent.com/${candidate.repo}/${candidate.branch}/${path}`, 20000)
            )
        );
        if (!texts[0]) continue;
        const items = parseFor(kind, texts.map(t => t ?? ""));
        if (items.length) return { items, repo: candidate.repo };
        console.warn(`resource ${kind}: ${candidate.repo} fetched but parsed to nothing`);
    }
    return { items: [], repo: SOURCES[kind].repo };
}

export async function getResources(
    kind: ResourceKindId,
    opts: { q?: string; group?: string; limit?: number; refresh?: boolean } = {}
): Promise<{
    items: ResourceItem[];
    groups: string[];
    total: number;
    cachedAt: number;
    source: string;
    repo: string;
}> {
    const cached = await loadCache(kind);
    let all = cached?.items ?? [];
    let fetchedAt = cached?.fetchedAt ?? 0;
    let repo = cached?.repo ?? SOURCES[kind].repo;

    if (opts.refresh || !all.length || Date.now() - fetchedAt > TTL) {
        const fresh = await build(kind);
        if (fresh.items.length) {
            all = fresh.items;
            repo = fresh.repo;
            fetchedAt = Date.now();
            await saveCache(kind, fresh.items, repo);
        }
    }

    const groups = Array.from(new Set(all.map(i => i.group))).sort();
    const q = (opts.q ?? "").trim().toLowerCase();
    let filtered = all;
    if (opts.group) filtered = filtered.filter(i => i.group === opts.group);
    if (q) {
        filtered = filtered.filter(
            i =>
                i.title.toLowerCase().includes(q) ||
                i.group.toLowerCase().includes(q) ||
                (i.note ?? "").toLowerCase().includes(q)
        );
    }

    return {
        items: filtered.slice(0, Math.max(1, Math.min(200, opts.limit ?? 60))),
        groups,
        total: filtered.length,
        cachedAt: fetchedAt,
        source: SOURCES[kind].credit,
        repo,
    };
}
