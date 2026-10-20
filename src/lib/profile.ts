import { create } from 'zustand';
import { api, auth } from '@appdeploy/client';
import { DEFAULT_RATING, Rating, ratingBand, updateRating } from './glicko';
import { PUZZLE_BY_ID } from './puzzles';
import { readBuilt } from './journey';

// One profile per identity. A device can hold a guest profile plus a profile for
// every account that has signed in on it, so two people sharing a laptop never
// inherit each other's rating.
const ACTIVE_KEY = 'ulox.active.v1';
const PROFILE_PREFIX = 'ulox.profile.v2:';
const LEGACY_KEY = 'ulox.profile.v1';

export interface Account {
  userId: string;
  name?: string;
  email?: string;
  picture?: string;
}

export interface SolveRecord {
  moves: number;
  seconds: number;
  hintsUsed: number;
  at: number;
  ratingDelta: number;
}

export interface Profile {
  playerId: string;
  name: string;
  colour: string;
  rating: Rating;
  xp: number;
  streak: number;
  lastActiveDay: string;
  solved: Record<string, SolveRecord>;
  /** Curated UloX topics plus live roadmap nodes, keyed "slug#nodeId". */
  topics: Record<string, 'seen' | 'done'>;
  rushBest: number;
  arena: { wins: number; losses: number; draws: number };
}

const COLOURS = ['#EE1B24', '#F5A524', '#37D67A', '#2F9BFF', '#B57BFF', '#FF6FB5'];
export const COLOUR_CHOICES = COLOURS;

function randomId(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshProfile(playerId = randomId()): Profile {
  return {
    playerId,
    name: `Player ${Math.floor(1000 + Math.random() * 9000)}`,
    colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    rating: { ...DEFAULT_RATING },
    xp: 0,
    streak: 0,
    lastActiveDay: '',
    solved: {},
    topics: {},
    rushBest: 0,
    arena: { wins: 0, losses: 0, draws: 0 },
  };
}

function normalise(raw: unknown, playerId: string): Profile {
  const parsed = (raw ?? {}) as Partial<Profile>;
  return {
    ...freshProfile(playerId),
    ...parsed,
    playerId,
    rating: { ...DEFAULT_RATING, ...parsed.rating },
    solved: parsed.solved ?? {},
    topics: parsed.topics ?? {},
    arena: { wins: 0, losses: 0, draws: 0, ...parsed.arena },
  };
}

const storageKey = (identity: string) => `${PROFILE_PREFIX}${identity}`;

function readIdentity(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || 'guest';
  } catch {
    return 'guest';
  }
}

function readProfile(identity: string): Profile | null {
  try {
    const raw = localStorage.getItem(storageKey(identity));
    if (raw) return normalise(JSON.parse(raw), identity === 'guest' ? guestPlayerId() : `user:${identity}`);
    // One-time migration from the pre-accounts single-profile layout.
    if (identity === 'guest') {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as Partial<Profile>;
        return normalise(parsed, parsed.playerId || guestPlayerId());
      }
    }
    return null;
  } catch {
    return null;
  }
}

let cachedGuestId = '';
function guestPlayerId(): string {
  if (cachedGuestId) return cachedGuestId;
  try {
    const stored = localStorage.getItem('ulox.guestid');
    if (stored) {
      cachedGuestId = stored;
      return stored;
    }
    cachedGuestId = randomId();
    localStorage.setItem('ulox.guestid', cachedGuestId);
  } catch {
    cachedGuestId = randomId();
  }
  return cachedGuestId;
}

function persist(identity: string, profile: Profile): Profile {
  try {
    localStorage.setItem(storageKey(identity), JSON.stringify(profile));
    localStorage.setItem(ACTIVE_KEY, identity);
  } catch {
    /* private mode — in-memory only */
  }
  return profile;
}

export function levelFor(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  let remaining = xp;
  let span = 120;
  while (remaining >= span) {
    remaining -= span;
    level += 1;
    span = Math.round(span * 1.28);
  }
  return { level, into: remaining, span };
}

export function bandFor(rating: number) {
  return ratingBand(rating);
}

function bootIdentity(): { identity: string; profile: Profile } {
  const identity = readIdentity();
  const stored = readProfile(identity);
  if (stored) return { identity, profile: stored };
  const fallback = readProfile('guest');
  if (fallback) return { identity: 'guest', profile: fallback };
  return { identity: 'guest', profile: freshProfile(guestPlayerId()) };
}

interface ProfileState {
  profile: Profile;
  /** 'guest' or an AppDeploy userId. */
  identity: string;
  account: Account | null;
  synced: boolean;
  authBusy: boolean;

  setName: (name: string) => void;
  setColour: (colour: string) => void;
  touchStreak: () => void;
  markTopic: (topicId: string, status: 'seen' | 'done') => void;
  recordSolve: (
    puzzleId: string,
    data: { moves: number; seconds: number; hintsUsed: number; success: boolean }
  ) => number;
  recordRush: (score: number) => void;
  recordArena: (result: 'win' | 'loss' | 'draw', opponentRating: number) => void;
  push: () => Promise<void>;
  restoreSession: () => Promise<void>;
  signIn: () => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

const boot = bootIdentity();

/** Merge a server-side profile into a local one, keeping the better of each. */
function mergeRemote(local: Profile, remote: Record<string, unknown>): Profile {
  const progress = (remote.progress ?? {}) as { solved?: Record<string, SolveRecord>; topics?: Record<string, 'seen' | 'done'> };
  return {
    ...local,
    name: typeof remote.name === 'string' && remote.name ? remote.name : local.name,
    colour: typeof remote.colour === 'string' && remote.colour ? remote.colour : local.colour,
    rating:
      typeof remote.rating === 'number' && Object.keys(local.solved).length === 0
        ? { ...local.rating, rating: remote.rating, rd: typeof remote.rd === 'number' ? remote.rd : local.rating.rd }
        : local.rating,
    xp: Math.max(local.xp, typeof remote.xp === 'number' ? remote.xp : 0),
    rushBest: Math.max(local.rushBest, typeof remote.rushBest === 'number' ? remote.rushBest : 0),
    streak: Math.max(local.streak, typeof remote.streak === 'number' ? remote.streak : 0),
    solved: { ...(progress.solved ?? {}), ...local.solved },
    topics: { ...(progress.topics ?? {}), ...local.topics },
    arena: {
      wins: Math.max(local.arena.wins, typeof remote.wins === 'number' ? remote.wins : 0),
      losses: Math.max(local.arena.losses, typeof remote.losses === 'number' ? remote.losses : 0),
      draws: local.arena.draws,
    },
  };
}

export const useProfile = create<ProfileState>((set, get) => ({
  profile: boot.profile,
  identity: boot.identity,
  account: null,
  synced: false,
  authBusy: false,

  setName: name =>
    set(state => ({
      profile: persist(state.identity, { ...state.profile, name: name.slice(0, 24) || state.profile.name }),
    })),

  setColour: colour => set(state => ({ profile: persist(state.identity, { ...state.profile, colour }) })),

  touchStreak: () =>
    set(state => {
      const day = today();
      if (state.profile.lastActiveDay === day) return state;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const streak = state.profile.lastActiveDay === yesterday ? state.profile.streak + 1 : 1;
      return { profile: persist(state.identity, { ...state.profile, streak, lastActiveDay: day }) };
    }),

  markTopic: (topicId, status) =>
    set(state => {
      if (state.profile.topics[topicId] === 'done' && status === 'seen') return state;
      const xpGain = status === 'done' && state.profile.topics[topicId] !== 'done' ? 40 : 0;
      return {
        profile: persist(state.identity, {
          ...state.profile,
          xp: state.profile.xp + xpGain,
          topics: { ...state.profile.topics, [topicId]: status },
        }),
      };
    }),

  recordSolve: (puzzleId, data) => {
    const puzzle = PUZZLE_BY_ID.get(puzzleId);
    const state = get();
    const opponent: Rating = { rating: puzzle?.elo ?? 1200, rd: 80, vol: 0.06 };
    const score = data.success ? (data.hintsUsed > 0 ? 0.6 : 1) : 0;
    const before = state.profile.rating.rating;
    const nextRating = updateRating(state.profile.rating, opponent, score);
    const delta = nextRating.rating - before;

    const xpGain = data.success ? Math.max(20, Math.round(60 - data.moves * 5 - data.hintsUsed * 10)) : 5;
    const existing = state.profile.solved[puzzleId];
    const record: SolveRecord = {
      moves: data.moves,
      seconds: data.seconds,
      hintsUsed: data.hintsUsed,
      at: Date.now(),
      ratingDelta: delta,
    };

    set({
      profile: persist(state.identity, {
        ...state.profile,
        rating: nextRating,
        xp: state.profile.xp + xpGain,
        solved: data.success
          ? { ...state.profile.solved, [puzzleId]: existing && existing.moves <= data.moves ? existing : record }
          : state.profile.solved,
      }),
    });
    get().touchStreak();
    void get().push();
    return delta;
  },

  recordRush: score => {
    set(state => ({
      profile: persist(state.identity, {
        ...state.profile,
        rushBest: Math.max(state.profile.rushBest, score),
        xp: state.profile.xp + score * 12,
      }),
    }));
    void get().push();
  },

  recordArena: (result, opponentRating) => {
    const state = get();
    const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    const nextRating = updateRating(state.profile.rating, { rating: opponentRating, rd: 100, vol: 0.06 }, score);
    set({
      profile: persist(state.identity, {
        ...state.profile,
        rating: nextRating,
        xp: state.profile.xp + (result === 'win' ? 90 : 30),
        arena: {
          wins: state.profile.arena.wins + (result === 'win' ? 1 : 0),
          losses: state.profile.arena.losses + (result === 'loss' ? 1 : 0),
          draws: state.profile.arena.draws + (result === 'draw' ? 1 : 0),
        },
      }),
    });
    void get().push();
  },

  push: async () => {
    const { profile } = get();
    try {
      await api.post('/api/players/upsert', {
        playerId: profile.playerId,
        name: profile.name,
        colour: profile.colour,
        rating: profile.rating.rating,
        rd: profile.rating.rd,
        xp: profile.xp,
        streak: profile.streak,
        solvedCount: Object.keys(profile.solved).length,
        rushBest: profile.rushBest,
        wins: profile.arena.wins,
        losses: profile.arena.losses,
        // The server re-checks every requirement before issuing a certificate,
        // so the build flags have to travel with the rest of the progress.
        progress: { solved: profile.solved, topics: profile.topics, built: readBuilt() },
      });
      set({ synced: true });
    } catch {
      set({ synced: false });
    }
  },

  /** Called on boot: re-attach an existing session without opening a popup. */
  restoreSession: async () => {
    try {
      if (!auth.isSignedIn()) return;
      const user = await auth.getUser();
      if (!user?.userId) return;
      await applyAccount(set, get, user);
    } catch {
      /* stay a guest */
    }
  },

  signIn: async () => {
    set({ authBusy: true });
    try {
      const { user } = await auth.signIn();
      await applyAccount(set, get, user);
      return { ok: true };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'popup_blocked') return { ok: false, message: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.' };
      if (code === 'popup_closed') return { ok: false, message: 'Sign-in was cancelled.' };
      return { ok: false, message: 'Sign-in failed. You can keep playing as a guest.' };
    } finally {
      set({ authBusy: false });
    }
  },

  signOut: async () => {
    set({ authBusy: true });
    try {
      await auth.signOut();
    } catch {
      /* clearing local state is what matters */
    }
    const guest = readProfile('guest') ?? freshProfile(guestPlayerId());
    set({ identity: 'guest', account: null, profile: persist('guest', guest), authBusy: false, synced: false });
  },
}));

type Setter = (partial: Partial<ProfileState>) => void;
type Getter = () => ProfileState;

async function applyAccount(set: Setter, get: Getter, user: Account) {
  const identity = user.userId;
  const playerId = `user:${identity}`;
  const existing = readProfile(identity);

  // First sign-in on this device adopts whatever the guest already earned.
  const base = existing ?? { ...get().profile, playerId, name: user.name || get().profile.name };
  let profile: Profile = { ...base, playerId };

  set({ identity, account: user, profile: persist(identity, profile) });

  // Then pull anything this account earned elsewhere.
  try {
    const res = await api.get(`/api/players/${encodeURIComponent(playerId)}`);
    if (res.data?.player) {
      profile = mergeRemote(profile, res.data.player as Record<string, unknown>);
      set({ profile: persist(identity, profile) });
    }
  } catch {
    /* no server profile yet */
  }
  await get().push();
}
