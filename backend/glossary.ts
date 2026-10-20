// The AI engineering glossary, from github.com/rohitg00/ai-engineering-from-scratch.
//
// This is the single highest-value thing that repo gives UloX: ~250 terms, each
// written as a direct definition plus why it matters, how it shows up in
// practice, and the confusion it is usually mistaken for. The whole premise of
// UloX is that people bounce off agentic engineering because of vocabulary, so a
// term lookup that is one tap from anywhere is not a nice-to-have.

import { db } from "@appdeploy/sdk";

const TABLE = "glossary_cache";
const TTL = 7 * 24 * 60 * 60 * 1000;
const CHUNK = 60;
const CACHE_VERSION = 1;

const SOURCE =
    "https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/main/glossary/terms.md";
export const GLOSSARY_REPO = "rohitg00/ai-engineering-from-scratch";

export interface GlossaryTerm {
    term: string;
    category: string;
    /** The direct definition. */
    means: string;
    why: string;
    practice: string;
    confusion: string;
    related: string[];
    /** Other names for the same thing — searching any of them must find it. */
    aliases: string[];
    /** Where to go next on this term. */
    learn: string;
}

interface ChunkRecord {
    part: number;
    terms: GlossaryTerm[];
    fetchedAt: number;
    v?: number;
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ulox-verionx" } });
        if (!res.ok) {
            console.warn(`glossary fetch ${res.status}`);
            return null;
        }
        return await res.text();
    } catch (err) {
        console.warn("glossary fetch failed:", err instanceof Error ? err.message : err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

const strip = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/**
 * Entries look like:
 *   ### Activation Checkpointing
 *   - **Category:** Math & training
 *   - **What it actually means:** ...
 *   - **Why it matters:** ...
 *   - **In practice:** ...
 *   - **Common confusion:** ...
 *   - **Related terms:** A, B, C
 */
export function parseGlossary(markdown: string): GlossaryTerm[] {
    const out: GlossaryTerm[] = [];
    const blocks = markdown.split(/\n(?=### )/);

    for (const block of blocks) {
        const head = /^###\s+(.+?)\s*$/m.exec(block);
        if (!head) continue;
        const term = strip(head[1]);
        if (!term) continue;

        const field = (label: string): string => {
            const re = new RegExp(`-\\s*\\*\\*${label}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*-\\s*\\*\\*|\\n### |$)`, "i");
            const m = re.exec(block);
            return m ? strip(m[1]).slice(0, 600) : "";
        };

        const means = field("What it actually means");
        if (!means) continue;

        out.push({
            term,
            category: field("Category") || "General",
            means,
            why: field("Why it matters"),
            practice: field("In practice"),
            confusion: field("Common confusion"),
            related: field("Related terms")
                .split(",")
                .map(s => strip(s))
                .filter(Boolean)
                .slice(0, 8),
            aliases: field("Aliases")
                .split(",")
                .map(s => strip(s))
                .filter(Boolean)
                .slice(0, 6),
            learn: field("Learn it"),
        });
    }

    return out;
}

async function loadCache(): Promise<{ terms: GlossaryTerm[]; fetchedAt: number } | null> {
    const { items } = await db.list<ChunkRecord>(TABLE, { limit: 200 });
    const mine = items.filter(row => (row.v ?? 0) === CACHE_VERSION).sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
    if (!mine.length) return null;
    return {
        terms: mine.flatMap(row => row.terms ?? []),
        fetchedAt: Math.min(...mine.map(row => row.fetchedAt ?? 0)),
    };
}

async function saveCache(terms: GlossaryTerm[]) {
    const { items } = await db.list<ChunkRecord>(TABLE, { limit: 200 });
    const stale = items.map(row => row.id);
    if (stale.length) await db.delete(TABLE, stale);

    const now = Date.now();
    const records: Array<Record<string, unknown>> = [];
    for (let part = 0; part * CHUNK < terms.length; part += 1) {
        records.push({ part, v: CACHE_VERSION, fetchedAt: now, terms: terms.slice(part * CHUNK, (part + 1) * CHUNK) });
    }
    for (let i = 0; i < records.length; i += 5) {
        await db.add(TABLE, records.slice(i, i + 5));
    }
}

export async function getGlossary(opts: { q?: string; category?: string; limit?: number; refresh?: boolean } = {}) {
    const cached = await loadCache();
    let all = cached?.terms ?? [];
    let fetchedAt = cached?.fetchedAt ?? 0;

    if (opts.refresh || !all.length || Date.now() - fetchedAt > TTL) {
        const md = await fetchText(SOURCE);
        if (md) {
            const parsed = parseGlossary(md);
            if (parsed.length) {
                all = parsed;
                fetchedAt = Date.now();
                await saveCache(parsed);
            }
        }
    }

    const categories = Array.from(new Set(all.map(t => t.category))).sort();
    const q = (opts.q ?? "").trim().toLowerCase();

    let filtered = all;
    if (opts.category) filtered = filtered.filter(t => t.category === opts.category);
    if (q) {
        filtered = filtered.filter(
            t =>
                t.term.toLowerCase().includes(q) ||
                t.means.toLowerCase().includes(q) ||
                t.aliases.some(a => a.toLowerCase().includes(q)) ||
                t.related.some(r => r.toLowerCase().includes(q))
        );
        // Exact and prefix matches first — someone searching "RAG" wants the
        // entry called RAG, not every definition that mentions it.
        filtered = [...filtered].sort((a, b) => rank(a.term, q, a.aliases) - rank(b.term, q, b.aliases));
    }

    return {
        terms: filtered.slice(0, Math.max(1, Math.min(200, opts.limit ?? 40))),
        categories,
        total: filtered.length,
        all: all.length,
        cachedAt: fetchedAt,
        repo: GLOSSARY_REPO,
    };
}

function rank(term: string, q: string, aliases: string[] = []): number {
    const names = [term, ...aliases].map(n => n.toLowerCase());
    if (names.some(n => n === q)) return 0;
    if (names.some(n => n.startsWith(q))) return 1;
    if (names.some(n => n.includes(q))) return 2;
    return 3;
}
