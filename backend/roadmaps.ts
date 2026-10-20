// Live roadmap.sh mirror.
//
// Three upstream sources, all public and key-free:
//   catalog   -> github.com/<owner>/developer-roadmap  (91 roadmap folders)
//   structure -> roadmap.sh/api/v1-official-roadmap/{slug}  (nodes + geometry)
//   lesson    -> raw.githubusercontent.com/.../roadmaps/{slug}/content/{file}.md
//
// Everything is cached in the database, so the app stays fast and survives a
// GitHub rate limit or a roadmap.sh outage.

import { ai, db } from "@appdeploy/sdk";

const CATALOG_TABLE = "roadmap_catalog";
const STRUCTURE_TABLE = "roadmap_structure";
const CONTENT_TABLE = "roadmap_content";
const FILES_TABLE = "roadmap_files";

// The owner's fork is the source of record so their edits show up here; the
// upstream is the fallback if the fork ever falls behind or goes private.
const REPO = "elijahmoses1000-jpg/developer-roadmap";
const REPO_FALLBACK = "nilbuild/developer-roadmap";
const CATALOG_TTL = 24 * 60 * 60 * 1000;
const STRUCTURE_TTL = 12 * 60 * 60 * 1000;
/**
 * Bump whenever the shape of a cached structure changes. Without this a cache
 * written by an older build keeps being served with fields the new renderer
 * needs silently missing — which is exactly how the connectors ended up drawn
 * from default sides instead of the ones upstream recorded.
 */
const STRUCTURE_VERSION = 2;

export interface SlimNode {
    id: string;
    type: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** Font size hint from upstream, used so headings still read as headings. */
    fs?: number;
    /** Upstream accent colour, when the node carries one. */
    colour?: string;
}

/**
 * Upstream encodes which side of a node a connector leaves and enters as a
 * handle id: x = bottom, w = top, z = right, y = left. Keeping it is what lets
 * us redraw the dotted connectors the way roadmap.sh does, instead of guessing
 * from node centres and getting spaghetti.
 */
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface SlimEdge {
    source: string;
    target: string;
    from: Side;
    to: Side;
    dashed: boolean;
}

export interface RoadmapStructure {
    slug: string;
    title: string;
    description: string;
    nodes: SlimNode[];
    edges: SlimEdge[];
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    topicCount: number;
}

const SIDE_BY_HANDLE: Record<string, Side> = { x: 'bottom', w: 'top', z: 'right', y: 'left' };

function sideOf(handle: unknown, fallback: Side): Side {
    const letter = String(handle ?? '').trim().charAt(0).toLowerCase();
    return SIDE_BY_HANDLE[letter] ?? fallback;
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<unknown | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "ulox-verionx", Accept: "application/vnd.github+json" },
        });
        if (!res.ok) {
            console.warn(`upstream ${res.status} for ${url}`);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.warn(`upstream fetch failed for ${url}:`, err instanceof Error ? err.message : err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchText(url: string, timeoutMs = 9000): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ulox-verionx" } });
        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function titleCase(slug: string): string {
    return slug
        .split("-")
        .map(part => (part.length <= 3 && part === part.toLowerCase() && ["ai", "api", "aws", "css", "sql", "ux", "qa", "cpp", "php", "ios", "git"].includes(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
        .join(" ");
}

// --- Catalog ----------------------------------------------------------------

export interface CatalogEntry {
    slug: string;
    title: string;
}

export async function getCatalog(force = false): Promise<{ roadmaps: CatalogEntry[]; cachedAt: number; live: boolean }> {
    const { items } = await db.list<{ slugs: string[]; fetchedAt: number }>(CATALOG_TABLE, { limit: 10 });
    const cached = items[0];
    const fresh = cached && Date.now() - (cached.fetchedAt ?? 0) < CATALOG_TTL;
    if (cached && fresh && !force) {
        return { roadmaps: cached.slugs.map(slug => ({ slug, title: titleCase(slug) })), cachedAt: cached.fetchedAt, live: false };
    }

    const listing =
        (await fetchJson(`https://api.github.com/repos/${REPO}/contents/roadmaps`)) ??
        (await fetchJson(`https://api.github.com/repos/${REPO_FALLBACK}/contents/roadmaps`));
    const slugs = Array.isArray(listing)
        ? (listing as Array<{ type?: string; name?: string }>)
              .filter(entry => entry.type === "dir" && typeof entry.name === "string")
              .map(entry => entry.name as string)
              .sort()
        : [];

    if (!slugs.length) {
        if (cached) {
            return { roadmaps: cached.slugs.map(slug => ({ slug, title: titleCase(slug) })), cachedAt: cached.fetchedAt, live: false };
        }
        return { roadmaps: [], cachedAt: 0, live: false };
    }

    const record = { slugs, fetchedAt: Date.now() };
    if (cached) await db.update(CATALOG_TABLE, [{ id: cached.id, record }]);
    else await db.add(CATALOG_TABLE, [record]);

    return { roadmaps: slugs.map(slug => ({ slug, title: titleCase(slug) })), cachedAt: record.fetchedAt, live: true };
}

// --- Structure --------------------------------------------------------------

const RENDERABLE = new Set(["topic", "subtopic", "title", "section", "label", "paragraph", "button", "linksgroup"]);

function slimStructure(slug: string, payload: unknown): RoadmapStructure | null {
    const raw = payload as {
        title?: string;
        description?: string;
        nodes?: Array<Record<string, unknown>>;
        edges?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(raw?.nodes)) return null;

    const nodes: SlimNode[] = [];
    for (const node of raw.nodes) {
        const type = String(node.type ?? "");
        if (!RENDERABLE.has(type)) continue;
        const data = (node.data ?? {}) as { label?: unknown; style?: { fontSize?: unknown; color?: unknown } };
        const label = typeof data.label === "string" ? data.label : "";
        if (!label) continue;
        const position = (node.position ?? {}) as { x?: unknown; y?: unknown };
        nodes.push({
            id: String(node.id ?? ""),
            type,
            label,
            x: Math.round(Number(position.x) || 0),
            y: Math.round(Number(position.y) || 0),
            w: Math.round(Number(node.width) || 200),
            h: Math.round(Number(node.height) || 44),
            fs: typeof data.style?.fontSize === "number" ? data.style.fontSize : undefined,
            colour: typeof data.style?.color === "string" ? data.style.color : undefined,
        });
    }
    if (!nodes.length) return null;

    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const rights = nodes.map(n => n.x + n.w);
    const bottoms = nodes.map(n => n.y + n.h);

    return {
        slug,
        title: typeof raw.title === "string" && raw.title ? raw.title : titleCase(slug),
        description: typeof raw.description === "string" ? raw.description : "",
        nodes,
        edges: Array.isArray(raw.edges)
            ? raw.edges
                  .map(edge => {
                      const style = (edge.style ?? {}) as { strokeDasharray?: unknown };
                      const data = (edge.data ?? {}) as { edgeStyle?: unknown };
                      return {
                          source: String(edge.source ?? ""),
                          target: String(edge.target ?? ""),
                          from: sideOf(edge.sourceHandle, "right"),
                          to: sideOf(edge.targetHandle, "left"),
                          dashed: data.edgeStyle === "dashed" || !!style.strokeDasharray,
                      };
                  })
                  .filter(edge => edge.source && edge.target)
            : [],
        bounds: {
            minX: Math.min(...xs),
            maxX: Math.max(...rights),
            minY: Math.min(...ys),
            maxY: Math.max(...bottoms),
        },
        topicCount: nodes.filter(n => n.type === "topic" || n.type === "subtopic").length,
    };
}

export async function getStructure(slug: string): Promise<RoadmapStructure | null> {
    const { items } = await db.list<{ slug: string; structure: RoadmapStructure; fetchedAt: number; v?: number }>(
        STRUCTURE_TABLE,
        { limit: 200 }
    );
    const cached = items.find(item => item.slug === slug);
    const currentShape = (cached?.v ?? 1) === STRUCTURE_VERSION;
    if (cached && currentShape && Date.now() - (cached.fetchedAt ?? 0) < STRUCTURE_TTL) return cached.structure;

    const payload = await fetchJson(`https://roadmap.sh/api/v1-official-roadmap/${slug}`);
    const structure = slimStructure(slug, payload);
    if (!structure) return currentShape ? cached?.structure ?? null : null;

    const record = { slug, structure, fetchedAt: Date.now(), v: STRUCTURE_VERSION } as unknown as Record<string, unknown>;
    if (cached) await db.update(STRUCTURE_TABLE, [{ id: cached.id, record }]);
    else await db.add(STRUCTURE_TABLE, [record]);
    return structure;
}

// --- Lesson content ---------------------------------------------------------

async function contentFiles(slug: string): Promise<string[]> {
    const { items } = await db.list<{ slug: string; files: string[]; fetchedAt: number }>(FILES_TABLE, { limit: 200 });
    const cached = items.find(item => item.slug === slug);
    if (cached && Date.now() - (cached.fetchedAt ?? 0) < CATALOG_TTL) return cached.files ?? [];

    const listing =
        (await fetchJson(`https://api.github.com/repos/${REPO}/contents/roadmaps/${slug}/content`)) ??
        (await fetchJson(`https://api.github.com/repos/${REPO_FALLBACK}/contents/roadmaps/${slug}/content`));
    const files = Array.isArray(listing)
        ? (listing as Array<{ type?: string; name?: string }>)
              .filter(entry => entry.type === "file" && typeof entry.name === "string" && entry.name.endsWith(".md"))
              .map(entry => entry.name as string)
        : [];
    if (!files.length) return cached?.files ?? [];

    const record = { slug, files, fetchedAt: Date.now() };
    if (cached) await db.update(FILES_TABLE, [{ id: cached.id, record }]);
    else await db.add(FILES_TABLE, [record]);
    return files;
}

export type ResourceKind = "video" | "article" | "official" | "course" | "feed" | "opensource" | "link";

export interface TopicResource {
    kind: ResourceKind;
    title: string;
    url: string;
}

export interface TopicLesson {
    slug: string;
    nodeId: string;
    label: string;
    markdown: string;
    /** Extracted from the lesson body so the UI can group and badge them. */
    resources: TopicResource[];
    source: "roadmap.sh" | "ulox-ai";
}

const KINDS: ResourceKind[] = ["video", "article", "official", "course", "feed", "opensource"];

/**
 * roadmap.sh tags every resource link as `[@video@Title](url)`. Pull those out
 * so videos can be surfaced separately, and fall back to plain markdown links
 * for anything untagged.
 */
function extractResources(markdown: string): TopicResource[] {
    const out: TopicResource[] = [];
    const seen = new Set<string>();

    for (const m of markdown.matchAll(/\[@([a-z]+)@([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi)) {
        const tag = m[1].toLowerCase();
        const kind = (KINDS as string[]).includes(tag) ? (tag as ResourceKind) : "link";
        const url = m[3];
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ kind, title: m[2].trim(), url });
    }

    for (const m of markdown.matchAll(/(?:^|\n)\s*[-*]\s*\[([^@\]][^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
        const url = m[2];
        if (seen.has(url)) continue;
        seen.add(url);
        const isVideo = /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
        out.push({ kind: isVideo ? "video" : "link", title: m[1].trim(), url });
    }

    // A YouTube or Vimeo URL is a video however it was tagged upstream.
    for (const r of out) {
        if (/youtube\.com|youtu\.be|vimeo\.com/i.test(r.url)) r.kind = "video";
    }

    return out.slice(0, 40);
}

export async function getTopic(slug: string, nodeId: string, label: string): Promise<TopicLesson> {
    const key = `${slug}#${nodeId}`;
    const { items } = await db.list<{ key: string; lesson: TopicLesson }>(CONTENT_TABLE, { limit: 1000 });
    const cached = items.find(item => item.key === key);
    if (cached?.lesson?.markdown) return cached.lesson;

    let markdown = "";
    let source: TopicLesson["source"] = "roadmap.sh";

    const files = await contentFiles(slug);
    const match = files.find(name => name.endsWith(`@${nodeId}.md`));
    if (match) {
        const path = `roadmaps/${slug}/content/${encodeURIComponent(match)}`;
        const text =
            (await fetchText(`https://raw.githubusercontent.com/${REPO}/master/${path}`)) ??
            (await fetchText(`https://raw.githubusercontent.com/${REPO_FALLBACK}/master/${path}`));
        if (text && text.trim()) markdown = text.trim();
    }

    // Anything roadmap.sh has not written up yet still gets a lesson, so every
    // node in every roadmap is learnable.
    if (!markdown) {
        try {
            const generated = await ai.generate({
                system:
                    "You write concise, technically accurate learning notes for a developer roadmap. " +
                    "Reply as markdown: one '# Title' line, then 2-3 short paragraphs, then a '## Key points' " +
                    "section with 3 to 5 '- ' bullets. No preamble, no code fences around the whole answer.",
                prompt: `Roadmap: ${titleCase(slug)}\nTopic: ${label || nodeId}\n\nExplain this topic for someone following this roadmap.`,
                maxTokens: 700,
                temperature: 0.3,
                thinkingMode: "FAST",
            });
            markdown = String(generated.text ?? "").trim();
            source = "ulox-ai";
        } catch (err) {
            console.warn("topic generation failed", err instanceof Error ? err.message : err);
        }
    }

    if (!markdown) {
        markdown = `# ${label || "Topic"}\n\nThis topic does not have written notes yet. Open it on roadmap.sh for the latest material.`;
        source = "roadmap.sh";
    }

    const lesson: TopicLesson = { slug, nodeId, label, markdown, resources: extractResources(markdown), source };
    if (cached) await db.update(CONTENT_TABLE, [{ id: cached.id, record: { key, lesson } as unknown as Record<string, unknown> }]);
    else await db.add(CONTENT_TABLE, [{ key, lesson } as unknown as Record<string, unknown>]);
    return lesson;
}
