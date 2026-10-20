// Published builds — the distribution loop.
//
// A learner builds an agent in the Lab and publishes it. What gets stored is
// the graph, not a video: the simulator is deterministic, so the viewer's own
// browser replays the identical run and they can scrub it, inspect any node and
// open the whole thing in their own Lab. A share is a few kilobytes and stays
// alive and explorable instead of being a flat recording of someone's screen.
//
// That is also what closes the loop: the only way to act on a shared agent is
// to open it in the Lab, at which point the viewer is building. Remixes are
// counted back to the author so the loop is visible to the person who started
// it.
//
// Everything in here is user-authored content rendered on a public page, so
// every field is bounded and scrubbed on the way in. React escapes on the way
// out; the caps are about denial of service and about a page staying legible.

import { db } from "@appdeploy/sdk";

const SHARES = "shares";

const MAX_NODES = 40;
const MAX_EDGES = 80;
const MAX_LABEL = 48;
const MAX_ITOLS = 600;
const MAX_TITLE = 80;
const MAX_NOTE = 240;
const MAX_NAME = 48;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface SharedGraph {
    nodes: Array<{
        id: string;
        kind: string;
        label: string;
        x: number;
        y: number;
        itols?: Record<string, string>;
    }>;
    edges: Array<{ id: string; source: string; target: string; condition: string }>;
    budget: number;
    requiredFacts: number;
    maxRetries: number;
}

export interface Share {
    id?: string;
    code: string;
    title: string;
    note: string;
    authorName: string;
    authorPlayerId: string;
    /** The pattern or stage it grew out of, for context on the public page. */
    origin: string;
    graph: SharedGraph;
    /** Eval score at publish time, so the card can show it without re-running. */
    score: number;
    createdAt: number;
    views: number;
    remixes: number;
}

/** Collapse whitespace, drop control characters, cap length. */
function clean(raw: unknown, max: number, fallback = ""): string {
    if (typeof raw !== "string") return fallback;
    const out = raw
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
    return out || fallback;
}

function num(raw: unknown, fallback: number): number {
    return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function makeCode(): string {
    let out = "";
    for (let i = 0; i < 8; i += 1) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return out;
}

/**
 * One flat shape rather than a discriminated union: the platform's
 * type-checker does not narrow a union across an `ok` guard, so a route
 * handler that needs `reason` cannot read it. Same reason as ClaimResult in
 * certificates.ts.
 */
export interface PublishResult {
    ok: boolean;
    share?: Share;
    reason?: "empty_graph" | "too_large" | "store_failed";
}

/**
 * Normalise an incoming graph. Anything the editor does not recognise is
 * dropped rather than stored: a public page should never be asked to render a
 * shape nobody designed for.
 */
function sanitiseGraph(raw: unknown): SharedGraph | null {
    const g = (raw ?? {}) as Record<string, unknown>;
    const rawNodes = Array.isArray(g.nodes) ? g.nodes : [];
    const rawEdges = Array.isArray(g.edges) ? g.edges : [];
    if (!rawNodes.length) return null;
    if (rawNodes.length > MAX_NODES || rawEdges.length > MAX_EDGES) return null;

    const nodes = rawNodes.slice(0, MAX_NODES).map(item => {
        const n = (item ?? {}) as Record<string, unknown>;
        const itolsRaw = (n.itols ?? null) as Record<string, unknown> | null;
        const itols: Record<string, string> = {};
        if (itolsRaw && typeof itolsRaw === "object") {
            for (const key of ["identity", "tasks", "outcome", "language", "security"]) {
                const value = clean(itolsRaw[key], MAX_ITOLS);
                if (value) itols[key] = value;
            }
        }
        const node: SharedGraph["nodes"][number] = {
            id: clean(n.id, 40, "n"),
            kind: clean(n.kind, 16, "agent"),
            label: clean(n.label, MAX_LABEL, "Node"),
            x: num(n.x, 0),
            y: num(n.y, 0),
        };
        if (Object.keys(itols).length) node.itols = itols;
        return node;
    });

    const ids = new Set(nodes.map(n => n.id));
    const edges = rawEdges
        .slice(0, MAX_EDGES)
        .map(item => {
            const e = (item ?? {}) as Record<string, unknown>;
            return {
                id: clean(e.id, 40, "e"),
                source: clean(e.source, 40),
                target: clean(e.target, 40),
                condition: clean(e.condition, 24, "always"),
            };
        })
        // An edge to a node that did not survive would draw to nowhere.
        .filter(e => ids.has(e.source) && ids.has(e.target));

    return {
        nodes,
        edges,
        budget: Math.max(0, Math.min(100000, num(g.budget, 2600))),
        requiredFacts: Math.max(0, Math.min(20, num(g.requiredFacts, 2))),
        maxRetries: Math.max(0, Math.min(10, num(g.maxRetries, 2))),
    };
}

export async function publishShare(body: Record<string, unknown>): Promise<PublishResult> {
    const graph = sanitiseGraph(body.graph);
    if (!graph) {
        const raw = (body.graph ?? {}) as Record<string, unknown>;
        const count = Array.isArray(raw.nodes) ? raw.nodes.length : 0;
        return { ok: false, reason: count > MAX_NODES ? "too_large" : "empty_graph" };
    }

    const share: Share = {
        code: makeCode(),
        title: clean(body.title, MAX_TITLE, "Untitled agent"),
        note: clean(body.note, MAX_NOTE),
        authorName: clean(body.authorName, MAX_NAME, "Anonymous"),
        authorPlayerId: clean(body.playerId, 64),
        origin: clean(body.origin, 48),
        graph,
        score: Math.max(-9.9, Math.min(9.9, num(body.score, 0))),
        createdAt: Date.now(),
        views: 0,
        remixes: 0,
    };

    const [id] = await db.add(SHARES, [share as unknown as Record<string, unknown>]);
    if (!id) return { ok: false, reason: "store_failed" };
    return { ok: true, share: { ...share, id } };
}

async function findByCode(code: string): Promise<(Share & { id: string }) | null> {
    const { items } = await db.list<Share>(SHARES, { limit: 1000 });
    const wanted = code.trim().toUpperCase();
    return (items.find(s => (s.code ?? "").toUpperCase() === wanted) as (Share & { id: string }) | undefined) ?? null;
}

/**
 * Read a share and count the view.
 *
 * The counter is best-effort on purpose: a view that fails to record is not a
 * reason to fail the page someone is trying to read.
 */
export async function getShare(code: string, countView = true): Promise<Share | null> {
    const found = await findByCode(code);
    if (!found) return null;
    if (countView) {
        try {
            await db.update(SHARES, [
                { id: found.id, record: { ...found, views: (found.views ?? 0) + 1 } as unknown as Record<string, unknown> },
            ]);
        } catch {
            /* the page matters more than the tally */
        }
    }
    return found;
}

/** Called when a viewer opens a shared build in their own Lab. */
export async function countRemix(code: string): Promise<number | null> {
    const found = await findByCode(code);
    if (!found) return null;
    const remixes = (found.remixes ?? 0) + 1;
    try {
        await db.update(SHARES, [
            { id: found.id, record: { ...found, remixes } as unknown as Record<string, unknown> },
        ]);
    } catch {
        return found.remixes ?? 0;
    }
    return remixes;
}

/** Everything one player has published, newest first. */
export async function listShares(playerId: string): Promise<Share[]> {
    const { items } = await db.list<Share>(SHARES, { limit: 1000 });
    return items
        .filter(s => s.authorPlayerId === playerId)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * The public gallery: most remixed first, then most viewed. Remixes rank above
 * views deliberately — the loop is people building on each other's work, not
 * people looking at it.
 */
export async function recentShares(limit = 24): Promise<Share[]> {
    const { items } = await db.list<Share>(SHARES, { limit: 1000 });
    return items
        .sort((a, b) => (b.remixes ?? 0) - (a.remixes ?? 0) || (b.views ?? 0) - (a.views ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, Math.max(1, Math.min(60, limit)));
}
