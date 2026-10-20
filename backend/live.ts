// Live lobby: who is online, where they are (coarsely, opt-in), what they are
// doing, and the challenges they send each other.
//
// Presence works for guests as well as signed-in players. When a valid token is
// present the record is marked verified and keyed to the AppDeploy user id, so a
// signed-in identity cannot be spoofed by another client.

import { auth, db } from "@appdeploy/sdk";
import { notifySubscribers } from "./realtime-subscribers";

const PRESENCE_TABLE = "presence";

export const LOBBY_ENTITY = "lobby";
export const LOBBY_ID = "global";

/** A player is "online" if we have heard from them inside this window. */
const ONLINE_MS = 95_000;
/** Rows older than this are deleted outright. */
const STALE_MS = 10 * 60_000;

export interface PresenceRecord {
    playerId: string;
    userId: string | null;
    name: string;
    colour: string;
    rating: number;
    verified: boolean;
    activity: string;
    /** Coarsened to ~11km. Null unless the player opted in. */
    lat: number | null;
    lng: number | null;
    place: string;
    lastSeen: number;
}

export type PublicPresence = Omit<PresenceRecord, "userId">;

function str(value: unknown, fallback = ""): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function num(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Never store a precise fix. One decimal place is roughly 11km — enough to put
 * someone on a world map, not enough to put them on a street.
 */
function coarsen(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (value < -180 || value > 180) return null;
    return Math.round(value * 10) / 10;
}

function isOnline(row: { lastSeen?: number }, now: number): boolean {
    return now - (row.lastSeen ?? 0) < ONLINE_MS;
}

function toPublic(row: PresenceRecord & { id: string }): PublicPresence & { id: string } {
    const { userId: _userId, ...rest } = row;
    void _userId;
    return rest;
}

async function loadAll(): Promise<Array<PresenceRecord & { id: string }>> {
    const { items } = await db.list<PresenceRecord>(PRESENCE_TABLE, { limit: 1000 });
    return items as Array<PresenceRecord & { id: string }>;
}

export async function listOnline(): Promise<Array<PublicPresence & { id: string }>> {
    const now = Date.now();
    const rows = await loadAll();
    return rows
        .filter(row => isOnline(row, now))
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 100)
        .map(toPublic);
}

async function broadcastLobby() {
    await notifySubscribers(LOBBY_ENTITY, LOBBY_ID, { type: "presence", players: await listOnline() });
}

export interface PingResult {
    you: PublicPresence & { id: string };
    players: Array<PublicPresence & { id: string }>;
}

export async function ping(event: unknown, body: unknown): Promise<PingResult | { error: string }> {
    const b = (body ?? {}) as Record<string, unknown>;
    const playerId = str(b.playerId);
    if (!playerId) return { error: "playerId is required" };

    // Optional auth: a token upgrades the record, its absence does not block it.
    let user = null;
    try {
        user = await auth.getUser(event as { headers?: Record<string, string | undefined> });
    } catch {
        user = null;
    }

    const now = Date.now();
    const rows = await loadAll();

    const stale = rows.filter(row => now - (row.lastSeen ?? 0) > STALE_MS).map(row => row.id);
    if (stale.length) await db.delete(PRESENCE_TABLE, stale.slice(0, 25));

    const identity = user?.userId ? `user:${user.userId}` : playerId;
    const existing = rows.find(row => row.playerId === identity);

    const shareLocation = b.shareLocation === true;
    const record: PresenceRecord = {
        playerId: identity,
        userId: user?.userId ?? null,
        name: str(b.name, user?.name ?? "Guest").slice(0, 24),
        colour: str(b.colour, "#EE1B24"),
        rating: Math.round(num(b.rating, 1200)),
        verified: !!user?.userId,
        activity: str(b.activity, "In the lobby").slice(0, 60),
        lat: shareLocation ? coarsen(b.lat) : null,
        lng: shareLocation ? coarsen(b.lng) : null,
        place: shareLocation ? str(b.place).slice(0, 48) : "",
        lastSeen: now,
    };

    if (existing) {
        await db.update(PRESENCE_TABLE, [{ id: existing.id, record: record as unknown as Record<string, unknown> }]);
    } else {
        await db.add(PRESENCE_TABLE, [record as unknown as Record<string, unknown>]);
    }

    const players = await listOnline();
    await broadcastLobby();
    const you = players.find(p => p.playerId === identity) ?? { ...toPublic({ ...record, id: existing?.id ?? "" }) };
    return { you, players };
}

export async function leave(playerId: string) {
    if (!playerId) return;
    const rows = await loadAll();
    const ids = rows.filter(row => row.playerId === playerId || row.playerId === `user:${playerId}`).map(row => row.id);
    if (ids.length) await db.delete(PRESENCE_TABLE, ids);
    await broadcastLobby();
}

/** Push a direct challenge down the lobby channel; clients filter on toPlayerId. */
export async function announceChallenge(payload: {
    type: "challenge" | "challenge-cancelled";
    fromPlayerId: string;
    fromName: string;
    toPlayerId: string;
    roomId: string;
    code: string;
}) {
    await notifySubscribers(LOBBY_ENTITY, LOBBY_ID, payload);
}
