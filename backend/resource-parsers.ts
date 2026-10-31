// Parsers for the four long-form collections.
//
// Kept apart from resources.ts, which talks to the database, so they can be
// run against the real READMEs on a laptop before a deploy. Each of these files
// is shaped differently enough that a shared list parser would quietly produce
// the wrong thing: awesome-python groups by ###, project-based-learning hangs
// "Part 1" links under an unlinked parent, coding-interview-university nests
// brackets inside link titles, and system-design-primer is prose whose useful
// index is its own headings.

export interface ParsedItem {
    title: string;
    url: string;
    group: string;
    note?: string;
    meta?: string;
}

/** Where a parsed batch came from, so relative links resolve to that copy. */
export interface Origin {
    repo: string;
    branch: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Strip inline markdown down to the words a reader sees. */
function plain(text: string): string {
    return text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** A heading as a label: inline markdown gone, and no trailing colon. */
const heading = (text: string) => plain(text).replace(/:\s*$/, "");

/**
 * GitHub's anchor for a heading, duplicates numbered the way GitHub numbers
 * them. Every heading in the file has to pass through here in order — not only
 * the ones we keep — or the second "Replication" gets the first one's anchor.
 */
function anchor(text: string, seen: Map<string, number>): string {
    const base = text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
}

/** The first line of real prose after a heading, for the card's one-liner. */
function firstProse(lines: string[], from: number): string | undefined {
    for (let i = from; i < lines.length && i < from + 40; i += 1) {
        const line = lines[i].trim();
        if (/^#{1,6}\s/.test(line)) return undefined;
        if (!line || /^[!>|<]/.test(line) || /^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) continue;
        const text = plain(line);
        if (text.length > 12) return clip(text, 180);
    }
    return undefined;
}

const LIST_LINK = /^\s*[-*]\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(.*)$/;

// --- awesome-python ---------------------------------------------------------

/**
 * Categories are `###` under `## Projects` (and a few under `## Resources`).
 * Everything above them is a sponsor block and an anchor-link contents table,
 * neither of which is a library.
 */
export function parseAwesomePython(md: string): ParsedItem[] {
    const out: ParsedItem[] = [];
    let section = "";
    let group = "";
    for (const line of md.split("\n")) {
        const h2 = /^##\s+(.+?)\s*$/.exec(line);
        if (h2) {
            section = heading(h2[1]);
            group = "";
            continue;
        }
        const h3 = /^###\s+(.+?)\s*$/.exec(line);
        if (h3) {
            group = heading(h3[1]);
            continue;
        }
        if ((section !== "Projects" && section !== "Resources") || !group) continue;
        const item = LIST_LINK.exec(line);
        if (!item) continue;
        const note = plain(item[3].replace(/^[\s\-–—]+/, ""));
        out.push({
            title: clip(item[1].trim(), 90),
            url: item[2],
            group,
            note: note ? clip(note, 150) : undefined,
        });
    }
    return out;
}

// --- project-based-learning -------------------------------------------------

/**
 * `## Language`, then `###`/`####` topics, then links. A multi-part tutorial is
 * an unlinked bullet with its parts indented under it as "Part 1", "Part 2" —
 * on their own those titles mean nothing, so the parent's name is carried down.
 */
export function parseTutorials(md: string): ParsedItem[] {
    const out: ParsedItem[] = [];
    const seen = new Set<string>();
    let group = "";
    let topic = "";
    let series = "";
    for (const line of md.split("\n")) {
        const h2 = /^##\s+(.+?)\s*$/.exec(line);
        if (h2) {
            group = heading(h2[1]);
            topic = "";
            series = "";
            continue;
        }
        const h34 = /^#{3,4}\s+(.+?)\s*$/.exec(line);
        if (h34) {
            topic = heading(h34[1]);
            series = "";
            continue;
        }
        if (!group || /table of contents/i.test(group)) continue;

        const indent = /^(\s*)/.exec(line)?.[1].length ?? 0;
        const linked = LIST_LINK.exec(line);
        if (linked) {
            if (indent === 0) series = "";
            if (seen.has(linked[2])) continue;
            seen.add(linked[2]);
            const own = plain(linked[1]);
            const tail = plain(linked[3].replace(/^[\s\-–—]+/, "")).replace(/^\(|\)$/g, "");
            out.push({
                title: clip(indent > 0 && series ? `${series} — ${own}` : own, 130),
                url: linked[2],
                group,
                meta: topic || undefined,
                note: tail ? clip(tail, 120) : undefined,
            });
            continue;
        }
        const bare = /^[-*]\s+(.+?)\s*$/.exec(line);
        if (bare && indent === 0) series = plain(bare[1]).replace(/:\s*$/, "");
    }
    return out;
}

// --- coding-interview-university --------------------------------------------

/** Sections about the study plan itself rather than the material in it. */
const PLAN_FRONT_MATTER =
    /^(what is it|table of contents|why use it|how to use it|don't feel|a note about video|license)/i;

/**
 * A link whose title may itself contain one bracketed tag — this file writes
 * "[[Review] Linked lists in 4 minutes (video)](…)", which a plain `[^\]]+`
 * stops halfway through. The lookbehind skips images.
 */
const NESTED_LINK = /(?<!!)\[((?:[^[\]]|\[[^\]]*\])+)\]\((https?:\/\/[^)\s]+)\)/g;

/**
 * A study plan: `## Section`, `- ### Topic`, then checkbox tasks with the
 * resources hanging off them. What a learner wants from it is those resources,
 * filed under the section and topic they belong to.
 */
export function parseInterviewPlan(md: string): ParsedItem[] {
    const out: ParsedItem[] = [];
    const seen = new Set<string>();
    let group = "";
    let topic = "";
    for (const line of md.split("\n")) {
        const h2 = /^##\s+(.+?)\s*$/.exec(line);
        if (h2) {
            group = heading(h2[1]);
            topic = "";
            continue;
        }
        const h3 = /^\s*(?:[-*]\s*)?#{3,4}\s+(.+?)\s*$/.exec(line);
        if (h3) {
            topic = heading(h3[1]);
            continue;
        }
        if (!group || PLAN_FRONT_MATTER.test(group)) continue;
        for (const m of line.matchAll(NESTED_LINK)) {
            const url = m[2];
            if (seen.has(url)) continue;
            seen.add(url);
            const title = plain(m[1]);
            if (!title) continue;
            out.push({
                title: clip(title, 120),
                url,
                group: clip(group, 60),
                meta: topic ? clip(topic, 40) : /\(video\)/i.test(title) ? "Video" : undefined,
            });
        }
    }
    return out;
}

// --- system-design-primer ---------------------------------------------------

/** The topic chapters run from here up to the appendix. */
const TOPICS_FROM = "Performance vs scalability";
const TOPICS_UNTIL = "Appendix";
/** Sub-headings that are scaffolding inside a topic, not a topic of their own. */
const SCAFFOLDING = /^(source\(s\)|disadvantage\(s\))/i;

/**
 * The primer is one long essay, so the useful index is its own structure:
 * every topic chapter and the concepts inside it, each linked to its exact
 * anchor in the README, plus the two tables of interview questions that come
 * with written solutions.
 */
export function parseDesignPrimer(md: string, origin: Origin): ParsedItem[] {
    const lines = md.split("\n");
    const out: ParsedItem[] = [];
    const seen = new Map<string, number>();
    const page = `https://github.com/${origin.repo}`;
    const blob = `https://github.com/${origin.repo}/blob/${origin.branch}`;

    let inTopics = false;
    let chapter = "";
    let section = "";
    let table = "";

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const h = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (h) {
            const level = h[1].length;
            const text = heading(h[2]);
            const slug = anchor(text, seen);
            if (level === 2) {
                chapter = text;
                if (text === TOPICS_FROM) inTopics = true;
                if (text === TOPICS_UNTIL) inTopics = false;
                table = /interview questions with solutions/i.test(text)
                    ? /object-oriented/i.test(text)
                        ? "Object-oriented design"
                        : "Interview questions"
                    : "";
                if (inTopics) {
                    out.push({
                        title: text,
                        url: `${page}#${slug}`,
                        group: text,
                        meta: "Overview",
                        note: firstProse(lines, i + 1),
                    });
                }
            } else if (level === 3 && inTopics && !SCAFFOLDING.test(text)) {
                section = text;
                out.push({ title: text, url: `${page}#${slug}`, group: chapter, note: firstProse(lines, i + 1) });
            } else if (level === 4 && inTopics && !SCAFFOLDING.test(text)) {
                // Sharding, federation, cache-aside, write-through: the concepts
                // people actually search for sit one level down, under a parent
                // that says what kind of thing they are.
                out.push({
                    title: text,
                    url: `${page}#${slug}`,
                    group: chapter,
                    meta: section || undefined,
                    note: firstProse(lines, i + 1),
                });
            }
            if (level <= 2) section = "";
            continue;
        }

        if (table && line.startsWith("|")) {
            const cells = line.split("|").slice(1, -1).map(c => c.trim());
            const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(cells[1] ?? "");
            if (!link || link[2].startsWith("#")) continue;
            out.push({
                title: plain(cells[0]),
                url: link[2].startsWith("http") ? link[2] : `${blob}/${link[2]}`,
                group: table,
                meta: "With solution",
            });
        }
    }
    return out;
}
