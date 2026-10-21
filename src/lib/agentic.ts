// Core agentic graph model for UloX by VerionX.
// A graph is the "position"; a move is an atomic architectural edit.

// The catalog names the parts; this file knows only the seven primitives they
// compile to. The import runs one way — node-catalog takes types from here and
// nothing else — so the two files cannot deadlock on load order.
import { DEFAULT_TYPE_FOR_KIND, NODE_TYPE_BY_ID } from './node-catalog';

export type NodeKind = 'entry' | 'agent' | 'tool' | 'condition' | 'guard' | 'memory' | 'terminal';

export type ItolsKey = 'identity' | 'tasks' | 'outcome' | 'language' | 'security';

export interface Itols {
  identity: string;
  tasks: string;
  outcome: string;
  language: string;
  security: string;
}

export interface ToolContract {
  /** What the tool consumes, e.g. 'query:string' */
  input: string;
  /** What the tool emits, e.g. 'documents:string[]' */
  output: string;
  /** Rough token cost per call, used by the cost model. */
  cost: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** Catalog entry this node was added from. Older graphs have none. */
  type?: string;
  label: string;
  x: number;
  y: number;
  itols?: Partial<Itols>;
  contract?: ToolContract;
  /** Declared inputs the node expects from upstream, e.g. ['documents']. */
  expects?: string[];
  /** Node is fixed by the puzzle author and cannot be edited or removed. */
  locked?: boolean;
}

export type EdgeCondition =
  | 'always'
  | 'needs_info'
  | 'satisfied'
  | 'on_success'
  | 'on_error'
  | 'retry_available'
  | 'budget_exceeded'
  | 'unsafe_input'
  | 'safe_input';

export const EDGE_CONDITIONS: EdgeCondition[] = [
  'always',
  'needs_info',
  'satisfied',
  'on_success',
  'on_error',
  'retry_available',
  'budget_exceeded',
  'unsafe_input',
  'safe_input',
];

export const CONDITION_LABEL: Record<EdgeCondition, string> = {
  always: 'always',
  needs_info: 'needs more info',
  satisfied: 'has enough info',
  on_success: 'tool succeeded',
  on_error: 'tool failed',
  retry_available: 'retries left',
  budget_exceeded: 'over budget',
  unsafe_input: 'input unsafe',
  safe_input: 'input safe',
};

/** Conditions that can break a cycle (i.e. they are not unconditionally true). */
export const EXIT_CONDITIONS: EdgeCondition[] = [
  'satisfied',
  'on_success',
  'on_error',
  'budget_exceeded',
  'unsafe_input',
  'safe_input',
  'needs_info',
  'retry_available',
];

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  condition: EdgeCondition;
  locked?: boolean;
}

export interface AgentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Ceiling used by the cost model. */
  budget: number;
  /** How many facts the agent needs before it is "satisfied". */
  requiredFacts: number;
  /** How many times a retry edge may fire. */
  maxRetries: number;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export type Move =
  | { type: 'ADD_NODE'; kind: NodeKind; nodeType?: string; label?: string; x?: number; y?: number }
  | { type: 'REMOVE_NODE'; nodeId: string }
  | { type: 'CONNECT_EDGE'; source: string; target: string; condition: EdgeCondition }
  | { type: 'REMOVE_EDGE'; edgeId: string }
  | { type: 'SET_CONDITION'; edgeId: string; condition: EdgeCondition }
  | { type: 'UPDATE_ITOLS'; nodeId: string; key: ItolsKey; value: string }
  | { type: 'MOVE_NODE'; nodeId: string; x: number; y: number };

/** Moves that change architecture. MOVE_NODE is cosmetic and never counts. */
export function isScoringMove(move: Move): boolean {
  return move.type !== 'MOVE_NODE';
}

export const KIND_META: Record<NodeKind, { label: string; hint: string; cost: number }> = {
  entry: { label: 'Entry', hint: 'Where the user request enters the system.', cost: 0 },
  agent: { label: 'Agent', hint: 'An LLM step governed by an ITOLS contract.', cost: 320 },
  tool: { label: 'Tool', hint: 'A deterministic external call with a typed contract.', cost: 90 },
  condition: { label: 'Router', hint: 'Branches the flow on evaluated state.', cost: 20 },
  guard: { label: 'Guard', hint: 'Handles failure, unsafe input and budget breaches.', cost: 40 },
  memory: { label: 'Memory', hint: 'Persists state between iterations of the loop.', cost: 30 },
  terminal: { label: 'Output', hint: 'A terminal state that returns the final answer.', cost: 10 },
};

const DEFAULT_LABEL: Record<NodeKind, string> = {
  entry: 'User Request',
  agent: 'Reasoning Agent',
  tool: 'Web Search',
  condition: 'Router',
  guard: 'Safety Guard',
  memory: 'Scratchpad',
  terminal: 'Final Answer',
};

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${counter}`;
}

export function makeNode(kind: NodeKind, partial: Partial<GraphNode> = {}): GraphNode {
  // A catalog part brings its own label, starter contract and declared inputs.
  // An explicit value in `partial` always wins: a pattern that names a label
  // means that label.
  const preset = partial.type ? NODE_TYPE_BY_ID.get(partial.type) : undefined;
  const base: GraphNode = {
    id: partial.id ?? nextId('n'),
    kind,
    label: partial.label ?? preset?.label ?? DEFAULT_LABEL[kind],
    x: partial.x ?? 120,
    y: partial.y ?? 120,
  };
  if (partial.type) base.type = partial.type;
  if (kind === 'agent' || kind === 'guard') {
    base.itols = { identity: '', tasks: '', outcome: '', language: '', security: '', ...preset?.itols, ...partial.itols };
  }
  if (kind === 'terminal' && (preset?.itols || partial.itols)) {
    base.itols = { ...preset?.itols, ...partial.itols };
  }
  if (kind === 'tool') {
    base.contract = partial.contract ?? preset?.contract ?? { input: 'query:string', output: 'documents:string[]', cost: 90 };
  }
  const expects = partial.expects ?? preset?.expects;
  if (expects) base.expects = expects;
  if (partial.locked) base.locked = true;
  return base;
}

/** The catalog part a node came from, falling back to its primitive's default. */
export function typeIdOf(node: GraphNode): string {
  return node.type ?? DEFAULT_TYPE_FOR_KIND[node.kind];
}

export function cloneGraph(g: AgentGraph): AgentGraph {
  return {
    budget: g.budget,
    requiredFacts: g.requiredFacts,
    maxRetries: g.maxRetries,
    nodes: g.nodes.map(n => ({
      ...n,
      itols: n.itols ? { ...n.itols } : undefined,
      contract: n.contract ? { ...n.contract } : undefined,
      expects: n.expects ? [...n.expects] : undefined,
    })),
    edges: g.edges.map(e => ({ ...e })),
  };
}

/**
 * Mutate a graph draft in place. Written against a draft so the store can wrap it
 * in Immer's produceWithPatches and keep an exact patch ledger of every move.
 * Returns false when the move was a no-op.
 */
export function mutateGraph(g: AgentGraph, move: Move): boolean {
  switch (move.type) {
    case 'ADD_NODE': {
      g.nodes.push(makeNode(move.kind, { type: move.nodeType, label: move.label, x: move.x, y: move.y }));
      return true;
    }
    case 'REMOVE_NODE': {
      const node = g.nodes.find(n => n.id === move.nodeId);
      if (!node || node.locked) return false;
      g.nodes = g.nodes.filter(n => n.id !== move.nodeId);
      g.edges = g.edges.filter(e => e.source !== move.nodeId && e.target !== move.nodeId);
      return true;
    }
    case 'CONNECT_EDGE': {
      if (move.source === move.target) return false;
      if (g.edges.some(e => e.source === move.source && e.target === move.target)) return false;
      if (!g.nodes.some(n => n.id === move.source) || !g.nodes.some(n => n.id === move.target)) return false;
      g.edges.push({ id: nextId('e'), source: move.source, target: move.target, condition: move.condition });
      return true;
    }
    case 'REMOVE_EDGE': {
      const edge = g.edges.find(e => e.id === move.edgeId);
      if (!edge || edge.locked) return false;
      g.edges = g.edges.filter(e => e.id !== move.edgeId);
      return true;
    }
    case 'SET_CONDITION': {
      const edge = g.edges.find(e => e.id === move.edgeId);
      if (!edge || edge.condition === move.condition) return false;
      edge.condition = move.condition;
      return true;
    }
    case 'UPDATE_ITOLS': {
      const node = g.nodes.find(n => n.id === move.nodeId);
      if (!node) return false;
      node.itols = { ...(node.itols ?? {}), [move.key]: move.value };
      return true;
    }
    case 'MOVE_NODE': {
      const node = g.nodes.find(n => n.id === move.nodeId);
      if (!node) return false;
      node.x = move.x;
      node.y = move.y;
      return true;
    }
    default:
      return false;
  }
}

/** Apply a move immutably. Returns the same graph reference when the move is a no-op. */
export function applyMove(graph: AgentGraph, move: Move): AgentGraph {
  const g = cloneGraph(graph);
  return mutateGraph(g, move) ? g : graph;
}

export function describeMove(graph: AgentGraph, move: Move): string {
  const name = (id: string) => graph.nodes.find(n => n.id === id)?.label ?? id;
  switch (move.type) {
    case 'ADD_NODE':
      return `+ ${NODE_TYPE_BY_ID.get(move.nodeType ?? '')?.label ?? KIND_META[move.kind].label} ${move.label ?? ''}`.trim();
    case 'REMOVE_NODE':
      return `- ${name(move.nodeId)}`;
    case 'CONNECT_EDGE':
      return `${name(move.source)} → ${name(move.target)} [${CONDITION_LABEL[move.condition]}]`;
    case 'REMOVE_EDGE': {
      const e = graph.edges.find(x => x.id === move.edgeId);
      return e ? `✕ ${name(e.source)} → ${name(e.target)}` : '✕ edge';
    }
    case 'SET_CONDITION': {
      const e = graph.edges.find(x => x.id === move.edgeId);
      return e ? `${name(e.source)} → ${name(e.target)} becomes [${CONDITION_LABEL[move.condition]}]` : 'set condition';
    }
    case 'UPDATE_ITOLS':
      return `${name(move.nodeId)} · ${move.key[0].toUpperCase() + move.key.slice(1)}`;
    case 'MOVE_NODE':
      return `reposition ${name(move.nodeId)}`;
    default:
      return 'move';
  }
}

/**
 * The condition a new edge should start with, inferred from what the two nodes
 * are. Defaulting everything to "always" would silently cost the learner a move
 * on every connection they make.
 */
export function defaultCondition(fromKind: NodeKind, toKind: NodeKind): EdgeCondition {
  if (fromKind === 'guard') return 'always';
  if (toKind === 'guard') return 'on_error';
  if (toKind === 'terminal') return fromKind === 'agent' ? 'satisfied' : 'always';
  if (fromKind === 'tool') return 'on_success';
  if (fromKind === 'agent' && toKind === 'tool') return 'needs_info';
  return 'always';
}

export function entryNodes(g: AgentGraph): GraphNode[] {
  const explicit = g.nodes.filter(n => n.kind === 'entry');
  if (explicit.length) return explicit;
  const targets = new Set(g.edges.map(e => e.target));
  return g.nodes.filter(n => !targets.has(n.id));
}

export function outgoing(g: AgentGraph, nodeId: string): GraphEdge[] {
  return g.edges.filter(e => e.source === nodeId);
}
