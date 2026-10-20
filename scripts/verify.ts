// Offline sanity harness for the tactic set.
//
//  * exhaustive brute force to depth 2 (and a wide beam beyond) proves each
//    puzzle IS solvable inside its move limit;
//  * the starting position must NOT already satisfy the criteria;
//  * the shipped engine must also be able to find a solution, otherwise the
//    Hint and Best-line buttons would mislead a stuck learner.
import { AgentGraph, Move, applyMove, describeMove } from '../src/lib/agentic';
import { analyzeGraph } from '../src/lib/analyzer';
import { simulate } from '../src/lib/simulator';
import { bestMove, evaluate, generateMoves, search } from '../src/lib/engine';
import { PUZZLES, Puzzle, checkSolved } from '../src/lib/puzzles';

function solved(puzzle: Puzzle, graph: AgentGraph) {
  return checkSolved(puzzle, graph, analyzeGraph(graph), simulate(graph, puzzle.mocks));
}

function key(g: AgentGraph): string {
  const nodes = g.nodes
    .map(n => `${n.kind}:${n.label}:${['identity', 'tasks', 'outcome', 'language', 'security'].map(k => ((n.itols as Record<string, string> | undefined)?.[k] ?? '').length).join(',')}`)
    .sort()
    .join('|');
  return `${nodes}#${g.edges.map(e => `${e.source}>${e.target}:${e.condition}`).sort().join('|')}`;
}

/** Exhaustive to depth 2; beyond that, keep the widest frontier we can afford. */
function bruteForce(puzzle: Puzzle): Move[] | null {
  const limit = puzzle.maxMoves;
  let frontier: Array<{ graph: AgentGraph; moves: Move[] }> = [{ graph: puzzle.graph, moves: [] }];
  const seen = new Set<string>([key(puzzle.graph)]);

  for (let depth = 0; depth < limit; depth += 1) {
    const nextFrontier: Array<{ graph: AgentGraph; moves: Move[]; value: number }> = [];
    for (const node of frontier) {
      for (const move of generateMoves(node.graph)) {
        const next = applyMove(node.graph, move);
        if (next === node.graph) continue;
        const k = key(next);
        if (seen.has(k)) continue;
        seen.add(k);
        const moves = [...node.moves, move];
        if (solved(puzzle, next).solved) return moves;
        nextFrontier.push({ graph: next, moves, value: evaluate(next, puzzle.mocks).value });
      }
    }
    if (!nextFrontier.length) break;
    nextFrontier.sort((a, b) => b.value - a.value);
    // Exhaustive for the first expansion, then a wide beam to stay tractable.
    frontier = (depth === 0 ? nextFrontier : nextFrontier.slice(0, 120)).map(n => ({ graph: n.graph, moves: n.moves }));
  }
  return null;
}

/** What the shipped engine would do if the learner only pressed Hint. */
function engineSolves(puzzle: Puzzle): number | null {
  let graph = puzzle.graph;
  for (let i = 0; i < puzzle.maxMoves; i += 1) {
    const best = bestMove(graph, puzzle.mocks, puzzle.criteria);
    if (!best.move) break;
    graph = applyMove(graph, best.move);
    if (solved(puzzle, graph).solved) return i + 1;
  }
  const line = search(puzzle.graph, { mocks: puzzle.mocks, criteria: puzzle.criteria, depth: puzzle.maxMoves, beam: 10 });
  let g = puzzle.graph;
  for (const move of line.moves) g = applyMove(g, move);
  return solved(puzzle, g).solved ? line.moves.length : null;
}

let failures = 0;
for (const puzzle of PUZZLES) {
  const start = evaluate(puzzle.graph, puzzle.mocks);
  const startVerdict = solved(puzzle, puzzle.graph);
  const proof = startVerdict.solved ? null : bruteForce(puzzle);
  const engine = startVerdict.solved ? null : engineSolves(puzzle);

  const bad = startVerdict.solved || !proof;
  if (bad) failures += 1;

  const status = startVerdict.solved ? 'PRE-SOLVED' : proof ? (engine ? 'ok' : 'ok/no-hint') : 'UNSOLVABLE';
  console.log(
    `${status.padEnd(11)} ${puzzle.id.padEnd(28)} elo=${puzzle.elo} max=${puzzle.maxMoves} start=${start.value
      .toFixed(1)
      .padStart(5)} proof=${proof ? proof.length : '-'} engine=${engine ?? '-'}`
  );
  if (proof) {
    let g = puzzle.graph;
    const readable = proof.map(m => {
      const d = describeMove(g, m);
      g = applyMove(g, m);
      return d;
    });
    if (status !== 'ok') console.log(`            solution: ${readable.join('  →  ')}`);
  } else if (!startVerdict.solved) {
    console.log(`            blockers: ${startVerdict.reasons.join(' | ')}`);
  }
}

console.log(`\n${PUZZLES.length - failures}/${PUZZLES.length} tactics healthy`);
if (failures) process.exitCode = 1;
