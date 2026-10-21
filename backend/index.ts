import { ai, db, error, invites, isInviteError, json, router, secrets } from "@appdeploy/sdk";
import { notifySubscribers, realtimeSubscriptionRoutes } from "./realtime-subscribers";
import { announceChallenge, leave, listOnline, ping } from "./live";
import { getCatalog, getStructure, getTopic } from "./roadmaps";
import { ResourceKindId, SOURCES, getResources } from "./resources";
import { getGlossary } from "./glossary";
import { countRemix, deleteOwnShare, getShare, listShares, publishShare, recentShares } from "./shares";
import {
    certificateStatus,
    claimCertificate,
    cleanName,
    getCertificate,
    listAllCertificates,
    revokeCertificates,
} from "./certificates";

const PLAYERS = "players";
const ROOMS = "rooms";

/** Set with AppDeploy app secrets. Without it the operator routes stay shut. */
const ADMIN_SECRET = "ULOX_ADMIN_TOKEN";

const MATCH_LENGTH = 5;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CHAT = 60;

// Kept in sync with src/lib/puzzles.ts. The backend only needs the ids so it can
// deal an identical, deterministic hand to both players in a match.
const PUZZLE_IDS = [
    "pzl_no_entry",
    "pzl_no_exit",
    "pzl_orphan_branch",
    "pzl_infinite_researcher",
    "pzl_format_brittle",
    "pzl_ambiguous_router",
    "pzl_silent_failure",
    "pzl_identity_drift",
    "pzl_type_mismatch",
    "pzl_amnesiac",
    "pzl_token_bonfire",
    "pzl_stuck_router",
    "pzl_retry_storm",
    "pzl_prompt_injection",
    "pzl_budget_blind",
    "pzl_unbounded_delegation",
    "pzl_double_loop",
    "pzl_guard_theatre",
];

interface PlayerRecord {
    playerId: string;
    name: string;
    /** How the learner wants their name typeset on a certificate. */
    certificateName?: string;
    colour: string;
    rating: number;
    rd: number;
    xp: number;
    streak: number;
    solvedCount: number;
    rushBest: number;
    wins: number;
    losses: number;
    /** Full progress blob so a signed-in player keeps their work across devices. */
    progress: {
        solved?: Record<string, unknown>;
        topics?: Record<string, string>;
        /** Stage builds completed in the Lab; certificates cannot be checked without it. */
        built?: Record<string, boolean>;
    };
    updatedAt: number;
}

interface RoomPlayer {
    playerId: string;
    name: string;
    colour: string;
    rating: number;
    index: number;
    correct: number;
    finishedAt: number | null;
}

interface ChatMessage {
    id: string;
    playerId: string;
    name: string;
    colour: string;
    text: string;
    at: number;
}

interface RoomRecord {
    code: string;
    seed: string;
    puzzleIds: string[];
    players: RoomPlayer[];
    chat: ChatMessage[];
    status: "waiting" | "playing" | "finished";
    winnerId: string | null;
    createdAt: number;
}

function str(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function num(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Gate for the operator routes. Returns a response when the caller should be
 * turned away, or null to let them through.
 *
 * Fails closed: if ULOX_ADMIN_TOKEN has not been configured, nobody gets in.
 * The alternative — treating "no secret" as "no gate" — would mean a single
 * missing deploy step silently opens certificate deletion to the internet.
 * Comparison is length-constant to avoid leaking the token a byte at a time.
 */
async function adminGate(body: unknown) {
    const supplied = str((body as Record<string, unknown> | undefined)?.token);
    if (!supplied) return error("Not found", 404);

    let expected: string;
    try {
        const names = await secrets.listSecretNames();
        if (!names.includes(ADMIN_SECRET)) return error("Not found", 404);
        expected = await secrets.readSecret(ADMIN_SECRET);
    } catch {
        return error("Not found", 404);
    }

    if (!expected || !timingSafeEqual(supplied, expected)) return error("Not found", 404);
    return null;
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function makeCode(): string {
    let out = "";
    for (let i = 0; i < 6; i += 1) {
        out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    return out;
}

/** Deterministic deal, so both sides of a match see the same positions in the same order. */
function dealPuzzles(seed: string, count: number): string[] {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const picked: string[] = [];
    const used = new Set<number>();
    let guard = 0;
    while (picked.length < Math.min(count, PUZZLE_IDS.length) && guard < 500) {
        guard += 1;
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        const idx = Math.abs(h) % PUZZLE_IDS.length;
        if (used.has(idx)) continue;
        used.add(idx);
        picked.push(PUZZLE_IDS[idx]);
    }
    return picked;
}

async function loadRoom(id: string): Promise<(RoomRecord & { id: string }) | null> {
    const [record] = await db.get<RoomRecord>(ROOMS, [id]);
    if (!record) return null;
    return { ...(record as RoomRecord), chat: (record as RoomRecord).chat ?? [], id };
}

function detach(room: RoomRecord & { id: string }): RoomRecord {
    return {
        code: room.code,
        seed: room.seed,
        puzzleIds: room.puzzleIds,
        players: room.players.map(p => ({ ...p })),
        chat: (room.chat ?? []).map(m => ({ ...m })),
        status: room.status,
        winnerId: room.winnerId,
        createdAt: room.createdAt,
    };
}

async function saveRoom(id: string, room: RoomRecord) {
    await db.update(ROOMS, [{ id, record: room as unknown as Record<string, unknown> }]);
    await notifySubscribers("room", id, { ...room, id });
}

function identityFrom(body: unknown): RoomPlayer | null {
    const b = (body ?? {}) as Record<string, unknown>;
    const playerId = str(b.playerId);
    if (!playerId) return null;
    return {
        playerId,
        name: str(b.name, "Guest").slice(0, 24),
        colour: str(b.colour, "#EE1B24"),
        rating: num(b.rating, 1200),
        index: 0,
        correct: 0,
        finishedAt: null,
    };
}

function settle(room: RoomRecord) {
    const total = room.puzzleIds.length;
    const everyoneDone = room.players.length >= 2 && room.players.every(p => p.index >= total);
    if (!everyoneDone) return;
    room.status = "finished";
    const [a, b] = [...room.players].sort((x, y) => {
        if (y.correct !== x.correct) return y.correct - x.correct;
        return (x.finishedAt ?? Infinity) - (y.finishedAt ?? Infinity);
    });
    if (!b || (a.correct === b.correct && a.finishedAt === b.finishedAt)) room.winnerId = null;
    else room.winnerId = a.playerId;
}

async function createRoom(player: RoomPlayer): Promise<{ room: RoomRecord & { id: string }; inviteCode: string | null } | null> {
    const code = makeCode();
    const room: RoomRecord = {
        code,
        seed: code,
        puzzleIds: dealPuzzles(code, MATCH_LENGTH),
        players: [player],
        chat: [],
        status: "waiting",
        winnerId: null,
        createdAt: Date.now(),
    };

    const [id] = await db.add(ROOMS, [room as unknown as Record<string, unknown>]);
    if (!id) return null;

    let inviteCode: string | null = null;
    try {
        const created = await invites.create({
            resourceType: "match",
            authMode: "anonymous",
            expiresInSec: 60 * 60 * 6,
            context: { roomId: id },
        });
        inviteCode = created.code;
    } catch (err) {
        if (!isInviteError(err)) throw err;
        console.warn("invite creation failed", err.code);
    }

    return { room: { ...room, id }, inviteCode };
}

export const handler = router({
    "GET /api/_healthcheck": [async () => json({ message: "Success" })],

    // --- Players ------------------------------------------------------------

    "POST /api/players/upsert": [
        async ({ body }) => {
            const b = (body ?? {}) as Record<string, unknown>;
            const playerId = str(b.playerId);
            if (!playerId) return error("playerId is required", 400);
            const name = str(b.name, "Guest").slice(0, 24);
            if (!name) return error("name is required", 400);

            // Only overwrite the printed name when one was actually sent: an
            // older client that does not know about this field must not blank
            // out a name the learner already chose.
            const sentCertName = str(b.certificateName).trim();

            const record: PlayerRecord = {
                playerId,
                name,
                colour: str(b.colour, "#EE1B24"),
                rating: num(b.rating, 1200),
                rd: num(b.rd, 350),
                xp: num(b.xp, 0),
                streak: num(b.streak, 0),
                solvedCount: num(b.solvedCount, 0),
                rushBest: num(b.rushBest, 0),
                wins: num(b.wins, 0),
                losses: num(b.losses, 0),
                progress:
                    b.progress && typeof b.progress === "object"
                        ? (b.progress as PlayerRecord["progress"])
                        : { solved: {}, topics: {} },
                updatedAt: Date.now(),
            };

            const { items } = await db.list<PlayerRecord>(PLAYERS, { limit: 1000 });
            const existing = items.find(item => item.playerId === playerId);
            if (existing) {
                const kept = sentCertName ? cleanName(sentCertName) : existing.certificateName;
                if (kept) record.certificateName = kept;
                await db.update(PLAYERS, [{ id: existing.id, record: record as unknown as Record<string, unknown> }]);
                return json({ ok: true, player: { ...record, id: existing.id } });
            }
            if (sentCertName) record.certificateName = cleanName(sentCertName);
            const [id] = await db.add(PLAYERS, [record as unknown as Record<string, unknown>]);
            if (!id) return error("Could not save the profile", 500);
            return json({ ok: true, player: { ...record, id } });
        },
    ],

    "GET /api/players/:playerId": [
        async ({ params }) => {
            const { items } = await db.list<PlayerRecord>(PLAYERS, { limit: 1000 });
            const found = items.find(item => item.playerId === params.playerId);
            if (!found) return error("No saved profile for that player", 404);
            return json({ player: found });
        },
    ],

    "GET /api/leaderboard": [
        async () => {
            const { items } = await db.list<PlayerRecord>(PLAYERS, { limit: 1000 });
            const players = items
                .filter(p => !!p.playerId && !!p.name)
                .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.solvedCount ?? 0) - (a.solvedCount ?? 0))
                .slice(0, 25)
                .map(p => ({
                    playerId: p.playerId,
                    name: p.name,
                    colour: p.colour,
                    rating: Math.round(p.rating ?? 1200),
                    solvedCount: p.solvedCount ?? 0,
                    streak: p.streak ?? 0,
                    rushBest: p.rushBest ?? 0,
                }));
            return json({ players });
        },
    ],

    // --- Live lobby ---------------------------------------------------------

    "POST /api/presence/ping": [
        async ({ body, event }) => {
            const result = await ping(event, body);
            if ("error" in result) return error(result.error, 400);
            return json(result);
        },
    ],

    "GET /api/presence": [async () => json({ players: await listOnline() })],

    "POST /api/presence/leave": [
        async ({ body }) => {
            const playerId = str((body as Record<string, unknown>)?.playerId);
            if (!playerId) return error("playerId is required", 400);
            await leave(playerId);
            return json({ ok: true });
        },
    ],

    "POST /api/challenges": [
        async ({ body }) => {
            const b = (body ?? {}) as Record<string, unknown>;
            const challenger = identityFrom(body);
            const toPlayerId = str(b.toPlayerId);
            if (!challenger) return error("playerId is required", 400);
            if (!toPlayerId) return error("toPlayerId is required", 400);
            if (toPlayerId === challenger.playerId) return error("You cannot challenge yourself", 400);

            const online = await listOnline();
            if (!online.some(p => p.playerId === toPlayerId)) {
                return error("That player just went offline", 409);
            }

            const created = await createRoom(challenger);
            if (!created) return error("Could not create the match", 500);

            await announceChallenge({
                type: "challenge",
                fromPlayerId: challenger.playerId,
                fromName: challenger.name,
                toPlayerId,
                roomId: created.room.id,
                code: created.room.code,
            });

            return json({ room: created.room, inviteCode: created.inviteCode });
        },
    ],

    // --- Matches ------------------------------------------------------------

    "POST /api/rooms": [
        async ({ body }) => {
            const player = identityFrom(body);
            if (!player) return error("playerId is required", 400);
            const created = await createRoom(player);
            if (!created) return error("Could not create the match", 500);
            return json({ room: created.room, inviteCode: created.inviteCode });
        },
    ],

    "POST /api/rooms/join": [
        async ({ body }) => {
            const player = identityFrom(body);
            if (!player) return error("playerId is required", 400);
            const code = str((body as Record<string, unknown>)?.code).toUpperCase();
            if (!code) return error("A match code is required", 400);

            const { items } = await db.list<RoomRecord>(ROOMS, { limit: 500 });
            const match = items.find(item => item.code === code && item.status !== "finished");
            if (!match) return error("No open match with that code", 404);

            const room = detach(match as unknown as RoomRecord & { id: string });
            if (!room.players.some(p => p.playerId === player.playerId)) {
                if (room.players.length >= 2) return error("That match is already full", 409);
                room.players.push(player);
                room.status = "playing";
            }
            await saveRoom(match.id, room);
            return json({ room: { ...room, id: match.id } });
        },
    ],

    "GET /api/rooms/:id": [
        async ({ params }) => {
            const room = await loadRoom(params.id);
            if (!room) return error("Match not found", 404);
            return json({ room });
        },
    ],

    "POST /api/rooms/:id/progress": [
        async ({ params, body }) => {
            const b = (body ?? {}) as Record<string, unknown>;
            const playerId = str(b.playerId);
            if (!playerId) return error("playerId is required", 400);

            const loaded = await loadRoom(params.id);
            if (!loaded) return error("Match not found", 404);
            const room = detach(loaded);

            const player = room.players.find(p => p.playerId === playerId);
            if (!player) return error("You are not in this match", 403);
            if (room.status === "finished") return json({ room: { ...room, id: params.id } });

            player.index = Math.min(room.puzzleIds.length, player.index + 1);
            if (b.correct === true) player.correct += 1;
            if (player.index >= room.puzzleIds.length && player.finishedAt === null) player.finishedAt = Date.now();

            settle(room);
            await saveRoom(params.id, room);
            return json({ room: { ...room, id: params.id } });
        },
    ],

    "POST /api/rooms/:id/chat": [
        async ({ params, body }) => {
            const b = (body ?? {}) as Record<string, unknown>;
            const playerId = str(b.playerId);
            const text = str(b.text).slice(0, 240);
            if (!playerId) return error("playerId is required", 400);
            if (!text) return error("Message cannot be empty", 400);

            const loaded = await loadRoom(params.id);
            if (!loaded) return error("Match not found", 404);
            const room = detach(loaded);

            const sender = room.players.find(p => p.playerId === playerId);
            if (!sender) return error("Only players in this match can chat", 403);

            room.chat = [
                ...room.chat,
                {
                    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                    playerId,
                    name: sender.name,
                    colour: sender.colour,
                    text,
                    at: Date.now(),
                },
            ].slice(-MAX_CHAT);

            await saveRoom(params.id, room);
            return json({ room: { ...room, id: params.id } });
        },
    ],

    // --- Invites ------------------------------------------------------------

    "GET /api/invites/:code": [
        async ({ params }) => {
            try {
                return json(await invites.resolve({ code: params.code }));
            } catch (err) {
                if (isInviteError(err)) return error(err.code, 400);
                throw err;
            }
        },
    ],

    "POST /api/invites/:code/join": [
        async ({ params, body }) => {
            const player = identityFrom(body);
            if (!player) return error("playerId is required", 400);

            let roomId = "";
            try {
                const joined = await invites.join({ code: params.code });
                roomId = str((joined.context ?? {}).roomId);
            } catch (err) {
                if (isInviteError(err)) return error(err.code, 400);
                throw err;
            }
            if (!roomId) return error("That invite does not point at a match", 400);

            const loaded = await loadRoom(roomId);
            if (!loaded) return error("Match not found", 404);
            const room = detach(loaded);

            if (!room.players.some(p => p.playerId === player.playerId)) {
                if (room.players.length >= 2) return error("That match is already full", 409);
                room.players.push(player);
                room.status = "playing";
            }
            await saveRoom(roomId, room);
            return json({ room: { ...room, id: roomId } });
        },
    ],

    // --- Roadmaps -----------------------------------------------------------

    "GET /api/roadmaps": [
        async ({ query }) => {
            const catalog = await getCatalog(query?.refresh === "1");
            return json(catalog);
        },
    ],

    "GET /api/roadmaps/:slug": [
        async ({ params }) => {
            const structure = await getStructure(params.slug);
            if (!structure) return error("That roadmap could not be loaded right now", 502);
            return json({ roadmap: structure });
        },
    ],

    // --- Certificates -------------------------------------------------------

    "GET /api/certificates": [
        async ({ query }) => {
            const playerId = str(query?.playerId);
            if (!playerId) return error("playerId is required", 400);
            return json(await certificateStatus(playerId));
        },
    ],

    "POST /api/certificates/claim": [
        async ({ body }) => {
            const b = (body ?? {}) as Record<string, unknown>;
            const playerId = str(b.playerId);
            const track = str(b.track);
            if (!playerId || !track) return error("playerId and track are required", 400);

            const result = await claimCertificate(playerId, track, str(b.name));
            if (result.ok && result.certificate) {
                return json({ certificate: result.certificate, alreadyHeld: !!result.alreadyHeld });
            }

            if (result.reason === "unknown_track") return error("No such certificate track", 404);
            if (result.reason === "no_profile") {
                return error("Save your profile first so your progress can be checked", 409);
            }
            return json(
                {
                    error: "not_earned",
                    message: "Some requirements are still outstanding.",
                    shortfall: result.shortfall,
                },
                409
            );
        },
    ],

    // --- Published builds (the distribution loop) ---------------------------

    "POST /api/shares": [
        async ({ body }) => {
            const result = await publishShare((body ?? {}) as Record<string, unknown>);
            if (result.ok && result.share) return json({ share: result.share });
            if (result.reason === "too_large") return error("That graph is too large to publish", 413);
            if (result.reason === "empty_graph") return error("There is nothing on the canvas to publish", 400);
            return error("Could not publish that build", 500);
        },
    ],

    "GET /api/shares": [
        async ({ query }) => {
            const playerId = str(query?.playerId);
            // With a playerId this is "my builds"; without it, the public gallery.
            if (playerId) return json({ shares: await listShares(playerId) });
            return json({ shares: await recentShares(24) });
        },
    ],

    "GET /api/shares/:code": [
        async ({ params, query }) => {
            // count=0 when the Lab loads a fork: arriving there is not a new view.
            const share = await getShare(params.code, query?.count !== "0");
            if (!share) return error("No published build with that code", 404);
            return json({ share });
        },
    ],

    "POST /api/shares/:code/delete": [
        async ({ params, body }) => {
            const playerId = str((body as Record<string, unknown> | undefined)?.playerId);
            if (!playerId) return error("playerId is required", 400);
            const outcome = await deleteOwnShare(params.code, playerId);
            if (outcome === "deleted") return json({ deleted: true, code: params.code });
            if (outcome === "not_found") return error("No published build with that code", 404);
            // Deliberately distinct from 404: the build exists, it is not yours.
            if (outcome === "not_yours") return error("That build was published by someone else", 403);
            return error("Could not remove that build", 500);
        },
    ],

    "POST /api/shares/:code/remix": [
        async ({ params }) => {
            const remixes = await countRemix(params.code);
            if (remixes === null) return error("No published build with that code", 404);
            return json({ remixes });
        },
    ],

    // Operator-only. Guarded by the ULOX_ADMIN_TOKEN secret rather than by the
    // sign-in system, because there is no notion of an admin account and
    // inventing one would be a larger security surface than this needs.
    "POST /api/admin/certificates/list": [
        async ({ body }) => {
            const denied = await adminGate(body);
            if (denied) return denied;
            return json({ certificates: await listAllCertificates() });
        },
    ],

    "POST /api/admin/certificates/revoke": [
        async ({ body }) => {
            const denied = await adminGate(body);
            if (denied) return denied;
            const b = (body ?? {}) as Record<string, unknown>;
            const codes = Array.isArray(b.codes) ? b.codes.map(c => str(c)).filter(Boolean) : [];
            const playerId = str(b.playerId);
            if (!codes.length && !playerId) return error("Pass codes[] or playerId", 400);
            const revoked = await revokeCertificates({ codes, playerId: playerId || undefined });
            return json({ revoked, count: revoked.length });
        },
    ],

    "GET /api/certificates/:code": [
        async ({ params }) => {
            const certificate = await getCertificate(params.code);
            if (!certificate) return error("No certificate with that code", 404);
            // Public verification: enough to confirm it is real, no player id.
            return json({
                certificate: {
                    code: certificate.code,
                    name: certificate.name,
                    track: certificate.track,
                    trackTitle: certificate.trackTitle,
                    issuedAt: certificate.issuedAt,
                    evidence: certificate.evidence,
                },
            });
        },
    ],

    // --- Glossary -----------------------------------------------------------

    "GET /api/glossary": [
        async ({ query }) => {
            const result = await getGlossary({
                q: str(query?.q),
                category: str(query?.category) || undefined,
                limit: Number(query?.limit) || undefined,
                refresh: query?.refresh === "1",
            });
            return json(result);
        },
    ],

    // --- Resource library ---------------------------------------------------

    "GET /api/resources/:kind": [
        async ({ params, query }) => {
            const kind = params.kind as ResourceKindId;
            if (!(kind in SOURCES)) return error("Unknown resource library", 404);
            const result = await getResources(kind, {
                q: str(query?.q),
                group: str(query?.group) || undefined,
                limit: Number(query?.limit) || undefined,
                refresh: query?.refresh === "1",
            });
            return json({ ...result, label: SOURCES[kind].label, blurb: SOURCES[kind].blurb });
        },
    ],

    "POST /api/roadmaps/:slug/topic": [
        async ({ params, body }) => {
            const b = (body ?? {}) as Record<string, unknown>;
            const nodeId = str(b.nodeId);
            if (!nodeId) return error("nodeId is required", 400);
            const lesson = await getTopic(params.slug, nodeId, str(b.label));
            return json({ lesson });
        },
    ],

    // --- AI mentor ----------------------------------------------------------

    "POST /api/mentor/review": [
        async ({ body }) => {
            const b = (body ?? {}) as {
                nodes?: Array<{ id?: string; kind?: string; label?: string; itols?: Record<string, string> }>;
                edges?: Array<{ source?: string; target?: string; condition?: string }>;
                budget?: number;
            };
            const nodes = Array.isArray(b.nodes) ? b.nodes.slice(0, 20) : [];
            const edges = Array.isArray(b.edges) ? b.edges.slice(0, 40) : [];
            if (!nodes.length) return error("Send a graph with at least one node", 400);

            const nodeLines = nodes
                .map(n => {
                    const itols = n.itols ?? {};
                    const filled =
                        ["identity", "tasks", "outcome", "language", "security"]
                            .filter(k => String(itols[k] ?? "").trim().length >= 8)
                            .join("/") || "none";
                    return `NODE | ${n.id} | ${n.kind} | ${n.label} | itols_present=${filled}`;
                })
                .join("\n");
            const edgeLines = edges.map(e => `EDGE | ${e.source} -> ${e.target} | when=${e.condition}`).join("\n");

            try {
                const result = await ai.generate({
                    system:
                        "You are a staff AI engineer reviewing an agent architecture for a learner. " +
                        "Judge it against the ITOLS framework (Identity, Tasks, Outcome, Language, Security) " +
                        "and against loop/graph engineering practice. " +
                        "Reply as 3 to 5 plain lines, each starting with '- '. No headings, no markdown, no JSON, no code fences. " +
                        "Each line: one concrete observation and the specific edit that fixes it. Be direct and specific to this graph.",
                    prompt: `Token budget: ${num(b.budget, 2000)}\n\n${nodeLines}\n${edgeLines}`,
                    maxTokens: 600,
                    temperature: 0.4,
                    thinkingMode: "FAST",
                });
                const review = String(result.text ?? "").trim();
                if (!review) return error("The mentor returned an empty review", 502);
                return json({ review });
            } catch (err) {
                const rpc = err as { statusCode?: number };
                console.error("mentor review failed", err instanceof Error ? err.message : err);
                if (rpc?.statusCode === 429) return error("The mentor is rate limited — try again shortly", 429);
                return error("The mentor is unavailable right now", 503);
            }
        },
    ],

    ...realtimeSubscriptionRoutes,
});
