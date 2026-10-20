// Certificates of completion.
//
// The client never says "I earned this". It asks, and the server re-derives
// every requirement of the discipline from the player's stored progress record
// before it issues anything; a claim that does not add up comes back with the
// exact list of what is still outstanding. Codes are issued once per track and
// are publicly verifiable.
//
// Known limit, stated plainly: that progress record is reported by the client
// through POST /api/profile, so this verifies the record, not the learning.
// Someone who edits their own browser storage can still produce a passing
// record. Closing that would mean scoring drills on the server — the puzzle
// definitions and the execution simulator currently live in the frontend — and
// recording topic reads as server-side events. Until then these certificates
// are an honest record of work, not a tamper-proof credential, which is why
// the UI never calls them an accredited qualification.

import { db } from "@appdeploy/sdk";

const CERTS = "certificates";
const PLAYERS = "players";

/**
 * Mirrors the stage definitions in src/lib/journey.ts. The frontend cannot be
 * imported here, so scripts/audit.ts fails the build if the two drift — a
 * mismatch would either hand out unearned certificates or make an earned one
 * unclaimable.
 */
export const STAGE_REQUIREMENTS: Record<string, { title: string; formal: string; topics: string[]; drills: string[] }> = {
    prompt: {
        title: "Ask properly",
        formal: "Prompt Engineering",
        topics: ["ai-agents", "prompt-engineering", "itols", "itols-writing"],
        drills: ["pzl_no_entry", "pzl_format_brittle", "pzl_identity_drift"],
    },
    context: {
        title: "Feed it the right things",
        formal: "Context Engineering",
        topics: ["memory", "rag", "embeddings", "few-shot"],
        drills: ["pzl_amnesiac", "pzl_prompt_injection"],
    },
    harness: {
        title: "Give it hands",
        formal: "Harness Engineering",
        topics: ["tool-binding", "error-handling", "llm-basics"],
        drills: ["pzl_type_mismatch", "pzl_silent_failure", "pzl_retry_storm"],
    },
    loop: {
        title: "Let it keep going",
        formal: "Loop Engineering",
        topics: ["agentic-loops", "cost-control", "reliability"],
        drills: ["pzl_infinite_researcher", "pzl_no_exit", "pzl_stuck_router"],
    },
    graph: {
        title: "Route many steps",
        formal: "Graph Engineering",
        topics: ["routing", "reflexion", "decomposition"],
        drills: ["pzl_ambiguous_router", "pzl_orphan_branch", "pzl_double_loop"],
    },
    agentic: {
        title: "Ship it safely",
        formal: "Agentic Engineering",
        topics: ["prompt-injection", "guardrails", "excessive-agency", "evals"],
        drills: ["pzl_guard_theatre", "pzl_unbounded_delegation", "pzl_budget_blind", "pzl_token_bonfire"],
    },
};

export const STAGE_ORDER = ["prompt", "context", "harness", "loop", "graph", "agentic"];

/** Awarded only when all six disciplines are complete. */
export const MASTER_ID = "master";
const MASTER_TITLE = "Agentic Engineering";

export interface Certificate {
    code: string;
    playerId: string;
    name: string;
    /** A stage id, or "master". */
    track: string;
    trackTitle: string;
    issuedAt: number;
    /** What the holder actually did, recorded at issue time. */
    evidence: { topics: number; drills: number; built: boolean; ratingAtIssue: number };
}

interface PlayerRecord {
    playerId: string;
    name: string;
    /**
     * The name the learner wants printed. Separate from `name`, which is the
     * short handle shown in the arena and on the leaderboard: "Eli" is right
     * next to a rating and wrong on a certificate.
     */
    certificateName?: string;
    rating: number;
    progress?: {
        solved?: Record<string, unknown>;
        topics?: Record<string, string>;
        built?: Record<string, boolean>;
    };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A printed name is permanent, so normalise it rather than trusting whatever
 * arrives: collapse runs of whitespace (a pasted name often carries a newline),
 * strip control characters, and cap the length the certificate can actually
 * typeset. The 64 is a layout limit, not a validation opinion about names.
 */
export function cleanName(raw: string | undefined): string {
    const cleaned = (raw ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 64);
    return cleaned || "Anonymous";
}

function makeCode(track: string): string {
    let tail = "";
    for (let i = 0; i < 6; i += 1) tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return `ULX-${track.toUpperCase().slice(0, 7)}-${tail}`;
}

async function findPlayer(playerId: string): Promise<(PlayerRecord & { id: string }) | null> {
    const { items } = await db.list<PlayerRecord>(PLAYERS, { limit: 1000 });
    return (items.find(item => item.playerId === playerId) as (PlayerRecord & { id: string }) | undefined) ?? null;
}

export interface Shortfall {
    topics: string[];
    drills: string[];
    built: boolean;
}

/** What is still missing for a track. Empty arrays and built=true means earned. */
export function shortfallFor(track: string, player: PlayerRecord): Shortfall {
    const progress = player.progress ?? {};
    const topicsDone = progress.topics ?? {};
    const solved = progress.solved ?? {};
    const built = progress.built ?? {};

    const stages = track === MASTER_ID ? STAGE_ORDER : [track];
    const missingTopics: string[] = [];
    const missingDrills: string[] = [];
    let allBuilt = true;

    for (const stageId of stages) {
        const req = STAGE_REQUIREMENTS[stageId];
        if (!req) continue;
        for (const topic of req.topics) if (topicsDone[topic] !== "done") missingTopics.push(topic);
        for (const drill of req.drills) if (!solved[drill]) missingDrills.push(drill);
        if (!built[stageId]) allBuilt = false;
    }

    return { topics: missingTopics, drills: missingDrills, built: allBuilt };
}

export function isEarned(s: Shortfall): boolean {
    return s.topics.length === 0 && s.drills.length === 0 && s.built;
}

function countFor(track: string): { topics: number; drills: number } {
    const stages = track === MASTER_ID ? STAGE_ORDER : [track];
    let topics = 0;
    let drills = 0;
    for (const id of stages) {
        const req = STAGE_REQUIREMENTS[id];
        if (!req) continue;
        topics += req.topics.length;
        drills += req.drills.length;
    }
    return { topics, drills };
}

export function trackTitle(track: string): string {
    if (track === MASTER_ID) return MASTER_TITLE;
    return STAGE_REQUIREMENTS[track]?.formal ?? track;
}

export async function listCertificates(playerId: string): Promise<Certificate[]> {
    const { items } = await db.list<Certificate>(CERTS, { limit: 1000 });
    return items
        .filter(c => c.playerId === playerId)
        .sort((a, b) => (b.issuedAt ?? 0) - (a.issuedAt ?? 0));
}

export async function getCertificate(code: string): Promise<Certificate | null> {
    const { items } = await db.list<Certificate>(CERTS, { limit: 1000 });
    return (items.find(c => c.code === code.toUpperCase()) as Certificate | undefined) ?? null;
}

/**
 * Deliberately one flat shape rather than a discriminated union: the platform's
 * type-checker would not narrow the union across the `ok` guard, and a route
 * handler that cannot read `reason` is worse than a few optional fields.
 */
export interface ClaimResult {
    ok: boolean;
    certificate?: Certificate;
    alreadyHeld?: boolean;
    reason?: "unknown_track" | "no_profile" | "not_earned";
    shortfall?: Shortfall;
}

export async function claimCertificate(playerId: string, track: string, displayName?: string): Promise<ClaimResult> {
    if (track !== MASTER_ID && !STAGE_REQUIREMENTS[track]) return { ok: false, reason: "unknown_track" };

    const player = await findPlayer(playerId);
    if (!player) return { ok: false, reason: "no_profile" };

    const existing = (await listCertificates(playerId)).find(c => c.track === track);
    if (existing) return { ok: true, certificate: existing, alreadyHeld: true };

    const shortfall = shortfallFor(track, player);
    if (!isEarned(shortfall)) return { ok: false, reason: "not_earned", shortfall };

    const counts = countFor(track);
    const certificate: Certificate = {
        code: makeCode(track),
        playerId,
        name: cleanName(displayName || player.certificateName || player.name),
        track,
        trackTitle: trackTitle(track),
        issuedAt: Date.now(),
        evidence: {
            topics: counts.topics,
            drills: counts.drills,
            built: true,
            ratingAtIssue: Math.round(player.rating ?? 1200),
        },
    };

    const [id] = await db.add(CERTS, [certificate as unknown as Record<string, unknown>]);
    if (!id) return { ok: false, reason: "no_profile" };
    return { ok: true, certificate, alreadyHeld: false };
}

/**
 * Administrative revocation. Issuing is one-way by design — a learner cannot
 * delete a certificate, or they could reissue one under a different name — so
 * removing a mistake (a test run, a certificate issued under a wrong name) has
 * to be an operator action behind the ULOX_ADMIN_TOKEN secret.
 *
 * Returns the codes it actually removed, so the caller can tell "nothing
 * matched" apart from "removed".
 */
export async function revokeCertificates(opts: { codes?: string[]; playerId?: string }): Promise<string[]> {
    const wanted = new Set((opts.codes ?? []).map(c => c.trim().toUpperCase()).filter(Boolean));
    if (!wanted.size && !opts.playerId) return [];

    const { items } = await db.list<Certificate>(CERTS, { limit: 1000 });
    const doomed = items.filter(c => wanted.has((c.code ?? "").toUpperCase()) || (!!opts.playerId && c.playerId === opts.playerId));
    if (!doomed.length) return [];

    const results = await db.delete(CERTS, doomed.map(c => c.id));
    return doomed.filter((_, i) => results[i]).map(c => c.code);
}

/** Every issued certificate, newest first. Operator view; never exposed publicly. */
export async function listAllCertificates(): Promise<Certificate[]> {
    const { items } = await db.list<Certificate>(CERTS, { limit: 1000 });
    return items.sort((a, b) => (b.issuedAt ?? 0) - (a.issuedAt ?? 0));
}

/** Every track with its current state, for the certificates screen. */
export async function certificateStatus(playerId: string) {
    const player = await findPlayer(playerId);
    const held = await listCertificates(playerId);
    const heldBy = new Map(held.map(c => [c.track, c]));

    const tracks = [...STAGE_ORDER, MASTER_ID].map(track => {
        const shortfall = player ? shortfallFor(track, player) : { topics: ["—"], drills: [], built: false };
        const counts = countFor(track);
        return {
            track,
            title: trackTitle(track),
            stageTitle: track === MASTER_ID ? "All six disciplines" : STAGE_REQUIREMENTS[track]?.title ?? "",
            earned: isEarned(shortfall),
            held: heldBy.get(track) ?? null,
            remaining: {
                topics: shortfall.topics.length,
                drills: shortfall.drills.length,
                built: shortfall.built,
            },
            totals: counts,
        };
    });

    return { tracks, held, hasProfile: !!player };
}
