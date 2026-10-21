import { AgentGraph, Move, applyMove, describeMove } from './agentic';
import { Issue } from './analyzer';
import { MockInjection } from './simulator';
import { Position, bestMove, evaluate, generateMoves, search } from './engine';
import { NextStep, nextStep } from './journey';
import type { Profile } from './profile';

/**
 * UX — the agent you can play against, and the one that explains itself.
 *
 * UX is not a scripted opponent. It plays through the same engine the Eval Bar
 * uses, so a move it makes is a move the analyzer genuinely rates, and the
 * reason it gives is read back out of the report rather than written in
 * advance: it names the fault that stopped being a fault. That is the only way
 * an explanation can be trusted — if the engine changes its mind, UX changes
 * its story with it.
 *
 * The three levels are not a difficulty slider over the same move. They change
 * how far UX looks and how willingly it settles for second best, which is what
 * actually separates a learner from someone sharp.
 */

export type UxLevel = 'learner' | 'steady' | 'sharp';

export const UX_LEVELS: Array<{ id: UxLevel; label: string; blurb: string }> = [
  { id: 'learner', label: 'Learner', blurb: 'Looks one move ahead and often takes the second-best fix. Beatable.' },
  { id: 'steady', label: 'Steady', blurb: 'Looks two moves ahead. Will not miss an obvious hole.' },
  { id: 'sharp', label: 'Sharp', blurb: 'Looks three moves ahead and plays the best line it finds.' },
];

const SETTINGS: Record<UxLevel, { depth: number; beam: number; slack: number }> = {
  // `slack` is how far down the ranked list UX is willing to reach.
  learner: { depth: 1, beam: 6, slack: 3 },
  steady: { depth: 2, beam: 9, slack: 1 },
  sharp: { depth: 3, beam: 12, slack: 0 },
};

export interface UxTurn {
  move: Move | null;
  /** The move in the app's own notation, e.g. "+ Guard". */
  description: string;
  /** Why UX played it, in one sentence, derived from the report. */
  reason: string;
  /** Position value after the move. */
  value: number;
}

/**
 * A stable pseudo-random pick.
 *
 * UX must be reproducible: the same position at the same level has to give the
 * same move, or two people reviewing a game see different things and the
 * replay on a shared link disagrees with what was played.
 */
function pick(seed: string, length: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, length);
}

const keyOf = (i: Issue) => `${i.code}:${i.nodeId ?? i.edgeId ?? ''}`;

function openFaults(issues: Issue[]): Set<string> {
  return new Set(issues.filter(i => i.severity === 'critical' || i.severity === 'warning').map(keyOf));
}

/**
 * Say what the move achieved, in the analyzer's own terms.
 *
 * Preference order matters: closing a critical fault is the thing worth
 * naming, then a warning, then whatever good thing appeared. Only when the
 * report says nothing new does UX fall back to the score, and it says so
 * plainly rather than inventing a rationale.
 */
function explain(before: Position, after: Position): string {
  const stillOpen = openFaults(after.report.issues);
  const closed = before.report.issues.filter(
    i => (i.severity === 'critical' || i.severity === 'warning') && !stillOpen.has(keyOf(i))
  );

  const critical = closed.find(i => i.severity === 'critical');
  if (critical) return `That clears a critical fault: ${critical.message}`;
  if (closed.length) return `That clears a warning: ${closed[0].message}`;

  const gained = after.report.issues.find(
    i => i.severity === 'good' && !before.report.issues.some(b => b.code === i.code && b.nodeId === i.nodeId)
  );
  if (gained) return gained.message;

  // Nothing closed. Say that, rather than reaching for the sentence about
  // having nothing left to play — which is a different thing entirely, and
  // reads as a contradiction printed next to the move that was just made.
  const delta = after.value - before.value;
  if (delta > 0.05) return `It closes nothing outright, but the position is ${delta.toFixed(1)} better — it sets the next fix up.`;
  if (delta < -0.05) return `It closes nothing and costs ${Math.abs(delta).toFixed(1)}.`;
  return 'It closes nothing on its own.';
}

/** What UX says when it has no move worth playing. */
function passing(position: Position): string {
  return position.report.sound
    ? 'Nothing left to fix on this board, so it passes.'
    : 'Nothing it can reach from here improves this board, so it passes.';
}

/**
 * What a move acts on, so UX can decline to act on it twice running.
 *
 * Below the top level UX chooses inside a window of near-equal moves, and
 * two conditions on one edge can sit either side of that window — which is
 * how it ended up setting the same arrow to "always", then "tool succeeded",
 * then back. Each step genuinely improved the score, so nothing caught it;
 * it just played like something with no memory.
 */
function subject(move: Move): string {
  switch (move.type) {
    case 'SET_CONDITION':
    case 'REMOVE_EDGE':
      return `e:${move.edgeId}`;
    case 'CONNECT_EDGE':
      return `e:${move.source}>${move.target}`;
    case 'REMOVE_NODE':
    case 'UPDATE_ITOLS':
      return `n:${move.nodeId}`;
    default:
      return '';
  }
}

/** UX takes a turn on the given position. `avoid` is the move it played last. */
export function uxTurn(graph: AgentGraph, mocks: MockInjection[], level: UxLevel, avoid?: Move | null): UxTurn {
  const before = evaluate(graph, mocks);
  const { depth, beam, slack } = SETTINGS[level];

  if (!slack) {
    const best = bestMove(graph, mocks);
    if (!best.move) return { move: null, description: '', reason: passing(before), value: before.value };
    const after = evaluate(applyMove(graph, best.move), mocks);
    return { move: best.move, description: best.description, reason: explain(before, after), value: after.value };
  }

  // Below the top level UX scores every legal move itself and then declines to
  // always take the best one. Ranking first and choosing second is what makes
  // a weaker opponent still look like it is playing the same game.
  const scored = generateMoves(graph)
    .map(move => {
      const next = applyMove(graph, move);
      if (next === graph) return null;
      const position = depth > 1 ? search(next, { mocks, depth: depth - 1, beam }).position : evaluate(next, mocks);
      return { move, next, position, value: position.value };
    })
    .filter((x): x is { move: Move; next: AgentGraph; position: Position; value: number } => !!x)
    .sort((a, b) => b.value - a.value);

  const improving = scored.filter(s => s.value > before.value + 0.001);
  if (!improving.length) return { move: null, description: '', reason: passing(before), value: before.value };

  // Prefer not to touch the same thing twice in a row — but never pass for the
  // sake of it: if that leaves nothing, the repeat was the only move going.
  const avoidKey = avoid ? subject(avoid) : '';
  const fresh = avoidKey ? improving.filter(s => subject(s.move) !== avoidKey) : improving;
  const pool = fresh.length ? fresh : improving;

  const window = pool.slice(0, 1 + slack);
  const chosen = window[pick(`${level}:${graph.nodes.length}:${graph.edges.length}:${pool.length}`, window.length)];
  const after = evaluate(chosen.next, mocks);
  return {
    move: chosen.move,
    description: describeMove(graph, chosen.move),
    reason: explain(before, after),
    value: after.value,
  };
}

/**
 * What UX would say about a move the learner just played.
 *
 * Deliberately short and specific. "Mistake" with no sentence after it is a
 * scoreboard, not a teacher.
 */
export function uxOnYourMove(before: Position, after: Position, bestValue: number): string {
  const loss = bestValue - after.value;
  const detail = explain(before, after);
  if (loss <= 0.01) return `Best move. ${detail}`;
  if (loss < 0.35) return `Good. ${detail}`;
  if (loss < 1.0) return `Playable, but about ${loss.toFixed(1)} more was available. ${detail}`;
  return `That gives up about ${loss.toFixed(1)}. ${detail}`;
}

// ---------------------------------------------------------------------------
// UX as a guide
// ---------------------------------------------------------------------------

/**
 * What UX says about where you are and what to do next.
 *
 * The next action is not UX's own opinion: it comes from `nextStep`, the same
 * function the Journey home renders. That is deliberate. A guide that worked
 * out its own answer would eventually disagree with the screen behind it, and
 * then one of them would be lying.
 *
 * The `here` line and the tip are the only things UX adds, and both are facts
 * about the app rather than encouragement.
 */
export interface UxBriefing {
  /** Where the person currently is, named the way the nav names it. */
  here: string;
  /** One thing worth knowing about this screen. */
  tip?: string;
  next: NextStep;
}

const AREAS: Array<{ match: RegExp; here: string; tip?: string }> = [
  {
    match: /^\/$|^\/journey/,
    here: 'The journey',
    tip: 'Six disciplines, in order: read it, drill it, build it. The next card is worked out from what you have actually finished, not from where you last clicked.',
  },
  {
    match: /^\/lab/,
    here: 'Build',
    tip: 'The Plan panel draws the shape you are aiming at before you wire anything, and the parts bin holds 30 named parts grouped by what they are for — search it rather than scrolling.',
  },
  {
    match: /^\/train|^\/rush/,
    here: 'Practice',
    tip: 'Every tactic is a real position with one move the engine rates best. Losing one teaches you more than winning four, as long as you read why.',
  },
  {
    match: /^\/play|^\/duel|^\/arena|^\/live|^\/join/,
    here: 'Play',
    tip: 'Four ways in: the clock, me, one on one, or two on two. I am the only one of the four that explains every move I make.',
  },
  {
    match: /^\/explore|^\/paths|^\/learn|^\/toolkit|^\/glossary|^\/book/,
    here: 'Explore',
    tip: 'Reference, not a queue. Nothing here is required — it is what you reach for when a word or a pattern stops making sense.',
  },
  {
    match: /^\/me|^\/certificates|^\/verify/,
    here: 'Your profile',
    tip: 'A certificate is issued against progress the server can see, so it has to be earned on this account rather than claimed.',
  },
  {
    match: /^\/gallery|^\/b\//,
    here: 'Published builds',
    tip: 'Anything here can be forked into your own Lab and changed. That is the fastest way to read somebody else\u2019s architecture.',
  },
];

export function uxBriefing(pathname: string, profile: Profile, built: Record<string, boolean>): UxBriefing {
  const area = AREAS.find(a => a.match.test(pathname));
  return {
    here: area?.here ?? 'UloX',
    tip: area?.tip,
    next: nextStep(profile, built),
  };
}
