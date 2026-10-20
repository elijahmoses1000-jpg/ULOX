import { create } from 'zustand';
import { Patch, applyPatches, enablePatches, produceWithPatches } from 'immer';
import {
  AgentGraph,
  Move,
  cloneGraph,
  describeMove,
  isScoringMove,
  mutateGraph,
} from './agentic';
import { MockInjection } from './simulator';
import { Puzzle } from './puzzles';

enablePatches();

export interface LedgerEntry {
  move: Move;
  description: string;
  patches: Patch[];
  inverse: Patch[];
  /** Snapshot after the move — powers the analysis board scrubber. */
  snapshot: AgentGraph;
  scoring: boolean;
  at: number;
}

export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null;

interface LabState {
  graph: AgentGraph;
  initial: AgentGraph;
  mocks: MockInjection[];
  ledger: LedgerEntry[];
  redoStack: LedgerEntry[];
  selection: Selection;
  puzzle: Puzzle | null;
  /** Index into the ledger the analysis board is currently showing; null = live. */
  reviewIndex: number | null;

  load: (graph: AgentGraph, mocks: MockInjection[], puzzle?: Puzzle | null) => void;
  dispatch: (move: Move) => boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  select: (selection: Selection) => void;
  review: (index: number | null) => void;
  movesUsed: () => number;
  movesLeft: () => number | null;
  /** Graph currently on screen, honouring the analysis scrubber. */
  viewGraph: () => AgentGraph;
}

export const useLab = create<LabState>((set, get) => ({
  graph: { nodes: [], edges: [], budget: 2000, requiredFacts: 1, maxRetries: 2 },
  initial: { nodes: [], edges: [], budget: 2000, requiredFacts: 1, maxRetries: 2 },
  mocks: [],
  ledger: [],
  redoStack: [],
  selection: null,
  puzzle: null,
  reviewIndex: null,

  load: (graph, mocks, puzzle = null) =>
    set({
      graph: cloneGraph(graph),
      initial: cloneGraph(graph),
      mocks,
      puzzle,
      ledger: [],
      redoStack: [],
      selection: null,
      reviewIndex: null,
    }),

  dispatch: move => {
    const state = get();
    const puzzle = state.puzzle;
    if (puzzle && isScoringMove(move)) {
      const used = state.ledger.filter(e => e.scoring).length;
      if (used >= puzzle.maxMoves) return false;
    }

    const [next, patches, inverse] = produceWithPatches(state.graph, draft => {
      mutateGraph(draft as AgentGraph, move);
    });

    if (!patches.length) return false;

    const entry: LedgerEntry = {
      move,
      description: describeMove(state.graph, move),
      patches,
      inverse,
      snapshot: cloneGraph(next),
      scoring: isScoringMove(move),
      at: Date.now(),
    };

    set({ graph: next, ledger: [...state.ledger, entry], redoStack: [], reviewIndex: null });
    return true;
  },

  undo: () => {
    const state = get();
    const last = state.ledger[state.ledger.length - 1];
    if (!last) return;
    set({
      graph: applyPatches(state.graph, last.inverse),
      ledger: state.ledger.slice(0, -1),
      redoStack: [...state.redoStack, last],
      reviewIndex: null,
    });
  },

  redo: () => {
    const state = get();
    const next = state.redoStack[state.redoStack.length - 1];
    if (!next) return;
    set({
      graph: applyPatches(state.graph, next.patches),
      ledger: [...state.ledger, next],
      redoStack: state.redoStack.slice(0, -1),
      reviewIndex: null,
    });
  },

  reset: () =>
    set(state => ({
      graph: cloneGraph(state.initial),
      ledger: [],
      redoStack: [],
      selection: null,
      reviewIndex: null,
    })),

  select: selection => set({ selection }),
  review: index => set({ reviewIndex: index }),

  movesUsed: () => get().ledger.filter(e => e.scoring).length,
  movesLeft: () => {
    const { puzzle } = get();
    if (!puzzle) return null;
    return Math.max(0, puzzle.maxMoves - get().movesUsed());
  },

  viewGraph: () => {
    const { reviewIndex, ledger, initial, graph } = get();
    if (reviewIndex === null) return graph;
    if (reviewIndex < 0) return initial;
    return ledger[reviewIndex]?.snapshot ?? graph;
  },
}));
