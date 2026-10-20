// The UloX Engine.
//
// Chess engines search a move tree and return a principal variation with a
// numeric evaluation. This does the same over architectural edits: it generates
// legal moves on the current graph, scores each resulting position with the
// static analyzer plus a deterministic execution simulation, and returns the
// best line it found. That is what powers "Best move", move classification and
// the retry hints.

import {
  AgentGraph,
  EDGE_CONDITIONS,
  EdgeCondition,
  ItolsKey,
  Move,
  applyMove,
  describeMove,
  outgoing,
} from './agentic';
import { EvalReport, ITOLS_HELP, analyzeGraph } from './analyzer';
import { SuccessCriteria, evaluateCriteria } from './criteria';
import { MockInjection, SimResult, simulate } from './simulator';

export interface Position {
  report: EvalReport;
  sim: SimResult;
  /** Combined evaluation used by search — analyzer score plus execution outcome. */
  value: number;
}

export interface Line {
  moves: Move[];
  descriptions: string[];
  value: number;
  position: Position;
}

export type MoveGrade = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const GRADE_META: Record<MoveGrade, { label: string; glyph: string; tone: string }> = {
  brilliant: { label: 'Brilliant', glyph: '!!', tone: 'brilliant' },
  best: { label: 'Best move', glyph: '!', tone: 'best' },
  good: { label: 'Good', glyph: '', tone: 'good' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', tone: 'inaccuracy' },
  mistake: { label: 'Mistake', glyph: '?', tone: 'mistake' },
  blunder: { label: 'Blunder', glyph: '??', tone: 'blunder' },
};

export function evaluate(graph: AgentGraph, mocks: MockInjection[]): Position {
  const report = analyzeGraph(graph);
  const sim = simulate(graph, mocks);

  let value = report.score;
  switch (sim.status) {
    case 'terminated':
      value += sim.producedOutcome ? 2.4 : 0.8;
      break;
    case 'infinite_cycle':
      value -= 3.4;
      break;
    case 'token_limit':
      value -= 2.0;
      break;
    case 'unsafe_exit':
      value -= 3.0;
      break;
    case 'stuck':
      value -= 1.6;
      break;
    case 'empty':
      value -= 2.0;
      break;
  }
  // Reward economy: fewer tokens for the same result is a better architecture.
  if (sim.status === 'terminated' && sim.tokens <= graph.budget) {
    value += 0.6 * (1 - sim.tokens / Math.max(1, graph.budget));
  }

  value = Math.max(-9.9, Math.min(9.9, Number(value.toFixed(2))));
  return { report, sim, value };
}

const CANONICAL_ITOLS: Record<ItolsKey, string> = {
  identity: ITOLS_HELP.identity.placeholder,
  tasks: ITOLS_HELP.tasks.placeholder,
  outcome: ITOLS_HELP.outcome.placeholder,
  language: ITOLS_HELP.language.placeholder,
  security: ITOLS_HELP.security.placeholder,
};

const ITOLS_KEYS: ItolsKey[] = ['identity', 'tasks', 'outcome', 'language', 'security'];

/**
 * Legal-move generator. Deliberately narrow: it proposes the kinds of edits a
 * learner would reach for, not every combinatorial possibility.
 */
export function generateMoves(graph: AgentGraph): Move[] {
  const moves: Move[] = [];

  // 1. Re-condition an existing edge.
  for (const edge of graph.edges) {
    if (edge.locked) continue;
    for (const cond of EDGE_CONDITIONS) {
      if (cond !== edge.condition) moves.push({ type: 'SET_CONDITION', edgeId: edge.id, condition: cond });
    }
  }

  // 2. Fill a missing ITOLS field.
  for (const node of graph.nodes) {
    if (node.kind !== 'agent' && node.kind !== 'guard') continue;
    for (const key of ITOLS_KEYS) {
      if ((node.itols?.[key] ?? '').trim().length < 8) {
        moves.push({ type: 'UPDATE_ITOLS', nodeId: node.id, key, value: CANONICAL_ITOLS[key] });
      }
    }
  }

  // 3. Add a terminal if none exists, or wire an existing one up.
  const terminals = graph.nodes.filter(n => n.kind === 'terminal');
  if (terminals.length === 0) {
    const anchor = graph.nodes[graph.nodes.length - 1];
    moves.push({ type: 'ADD_NODE', kind: 'terminal', label: 'Final Answer', x: (anchor?.x ?? 200) + 220, y: anchor?.y ?? 160 });
  }

  const guards = graph.nodes.filter(n => n.kind === 'guard');
  if (guards.length === 0 && graph.nodes.some(n => n.kind === 'tool')) {
    const anchor = graph.nodes.find(n => n.kind === 'tool');
    moves.push({ type: 'ADD_NODE', kind: 'guard', label: 'Safety Guard', x: (anchor?.x ?? 200), y: (anchor?.y ?? 160) + 170 });
  }

  // 4. Connect plausible pairs that are not yet connected.
  const conditionsFor = (fromKind: string, toKind: string): EdgeCondition[] => {
    // A guard is a recovery step: it hands off unconditionally once it has run.
    if (fromKind === 'guard') return ['always', 'retry_available', 'satisfied'];
    if (toKind === 'terminal') return ['satisfied', 'budget_exceeded'];
    if (toKind === 'guard') return ['on_error', 'unsafe_input'];
    if (fromKind === 'tool') return ['on_success', 'on_error'];
    return ['always', 'needs_info'];
  };

  for (const a of graph.nodes) {
    if (a.kind === 'terminal') continue;
    for (const b of graph.nodes) {
      if (a.id === b.id || b.kind === 'entry') continue;
      if (graph.edges.some(e => e.source === a.id && e.target === b.id)) continue;
      if (outgoing(graph, a.id).length >= 3) continue;
      for (const cond of conditionsFor(a.kind, b.kind)) {
        moves.push({ type: 'CONNECT_EDGE', source: a.id, target: b.id, condition: cond });
      }
    }
  }

  // 5. Cut an edge. Topology is the real permission boundary, so removing a
  //    reachable path is a first-class move, not a last resort.
  for (const edge of graph.edges) {
    if (!edge.locked) moves.push({ type: 'REMOVE_EDGE', edgeId: edge.id });
  }

  // 6. Prune a node that no longer carries traffic.
  for (const node of graph.nodes) {
    if (node.locked || node.kind === 'entry') continue;
    const isolated = !graph.edges.some(e => e.source === node.id || e.target === node.id);
    if (isolated) moves.push({ type: 'REMOVE_NODE', nodeId: node.id });
  }

  return moves;
}

/** Deterministic key so identical graphs are not re-searched. */
function graphKey(g: AgentGraph): string {
  const nodes = g.nodes
    .map(n => `${n.kind}:${n.label}:${ITOLS_KEYS.map(k => (n.itols?.[k] ?? '').length).join(',')}`)
    .sort()
    .join('|');
  const edges = g.edges.map(e => `${e.source}>${e.target}:${e.condition}`).sort().join('|');
  return `${nodes}#${edges}`;
}

export interface SearchOptions {
  depth?: number;
  beam?: number;
  mocks: MockInjection[];
  /**
   * When solving a tactic the engine searches toward the puzzle's goal, not
   * merely toward the highest eval — the same way an engine solving "mate in 2"
   * plays the mate rather than the move that wins the most material.
   */
  criteria?: SuccessCriteria;
}

/** Ordering value used inside search. Equals the honest eval in free play. */
function ordering(graph: AgentGraph, position: Position, criteria?: SuccessCriteria): number {
  if (!criteria) return position.value;
  const verdict = evaluateCriteria(criteria, graph, position.report, position.sim);
  if (verdict.solved) return 1000 + position.value;
  const total = verdict.passed.length + verdict.reasons.length;
  const progress = total ? verdict.passed.length / total : 0;
  return position.value + progress * 12;
}

/**
 * Beam search with iterative deepening. Returns the best line found, plus the
 * best single move so the UI can offer a one-step hint.
 */
export function search(graph: AgentGraph, options: SearchOptions): Line {
  const depth = Math.max(1, Math.min(4, options.depth ?? 2));
  const beam = Math.max(2, Math.min(14, options.beam ?? 6));
  const { mocks, criteria } = options;

  const rootPosition = evaluate(graph, mocks);
  const root: Line = { moves: [], descriptions: [], value: rootPosition.value, position: rootPosition };

  type Candidate = { graph: AgentGraph; line: Line; order: number };
  let frontier: Candidate[] = [{ graph, line: root, order: ordering(graph, rootPosition, criteria) }];
  let best = root;
  let bestOrder = frontier[0].order;
  const seen = new Set<string>([graphKey(graph)]);

  for (let d = 0; d < depth; d += 1) {
    const candidates: Candidate[] = [];

    for (const node of frontier) {
      for (const move of generateMoves(node.graph)) {
        const next = applyMove(node.graph, move);
        if (next === node.graph) continue;
        const key = graphKey(next);
        if (seen.has(key)) continue;
        seen.add(key);

        const position = evaluate(next, mocks);
        const line: Line = {
          moves: [...node.line.moves, move],
          descriptions: [...node.line.descriptions, describeMove(node.graph, move)],
          value: position.value,
          position,
        };
        const order = ordering(next, position, criteria);
        candidates.push({ graph: next, line, order });
        if (order > bestOrder + 0.001) {
          bestOrder = order;
          best = line;
        }
      }
      if (candidates.length > 3000) break;
    }

    if (!candidates.length) break;
    // A solved position is terminal: nothing deeper can beat it, and a shorter
    // line is a better hint than a longer one.
    if (criteria && bestOrder >= 1000) break;

    candidates.sort((a, b) => b.order - a.order);

    // Pure greedy pruning is blind to fixes that get worse before they get
    // better — an unwired Guard costs a point now and saves five next ply.
    // Keep the strongest line of every move type alongside the top scorers.
    const kept: Candidate[] = candidates.slice(0, beam);
    const inKept = new Set(kept);
    const perType = new Map<string, number>();
    for (const candidate of kept) {
      const type = candidate.line.moves[candidate.line.moves.length - 1]?.type ?? '';
      perType.set(type, (perType.get(type) ?? 0) + 1);
    }
    for (const candidate of candidates) {
      const type = candidate.line.moves[candidate.line.moves.length - 1]?.type ?? '';
      if (inKept.has(candidate) || (perType.get(type) ?? 0) >= 2) continue;
      perType.set(type, (perType.get(type) ?? 0) + 1);
      inKept.add(candidate);
      kept.push(candidate);
    }
    frontier = kept;
  }

  return best;
}

/**
 * Best single move from the current position — the first move of the principal
 * variation, not the greediest immediate gain. This matters: some fixes cost a
 * point now and save five next ply (an unwired Guard, a freshly added Output),
 * and a hint that refuses to play those would strand the learner exactly where
 * they are already stuck.
 */
export function bestMove(
  graph: AgentGraph,
  mocks: MockInjection[],
  criteria?: SuccessCriteria
): { move: Move | null; value: number; description: string } {
  const line = search(graph, { mocks, criteria, depth: criteria ? 3 : 2, beam: 10 });
  if (line.moves.length) {
    return { move: line.moves[0], value: line.value, description: line.descriptions[0] };
  }

  // Nothing improves over two plies; fall back to any single improving move.
  let bestVal = evaluate(graph, mocks).value;
  let chosen: Move | null = null;
  let description = '';
  for (const move of generateMoves(graph)) {
    const next = applyMove(graph, move);
    if (next === graph) continue;
    const v = evaluate(next, mocks).value;
    if (v > bestVal + 0.001) {
      bestVal = v;
      chosen = move;
      description = describeMove(graph, move);
    }
  }
  return { move: chosen, value: bestVal, description };
}

/** Lichess-style grading of the move the learner actually played. */
export function gradeMove(beforeValue: number, afterValue: number, bestValue: number): MoveGrade {
  const loss = bestValue - afterValue;
  const gain = afterValue - beforeValue;
  if (loss <= 0.01 && gain >= 2.5) return 'brilliant';
  if (loss <= 0.01) return 'best';
  if (loss < 0.35) return 'good';
  if (loss < 1.0) return 'inaccuracy';
  if (loss < 2.5) return 'mistake';
  return 'blunder';
}
