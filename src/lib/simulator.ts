// Depth 3 of the Agent Eval Bar: deterministic execution simulation.
// Runs the graph against author-supplied mock injections so a learner can
// watch the loop actually execute — and step through it afterwards.

import { AgentGraph, EdgeCondition, GraphNode, KIND_META, entryNodes, outgoing } from './agentic';

export interface MockInjection {
  nodeId: string;
  /** HTTP-ish status the mocked tool returns. */
  status: number;
  /** Payload handed back to the caller. */
  data: string;
  /** Optional adversarial payload used by security puzzles. */
  injectedInstruction?: string;
}

/**
 * Several injections may target the same node. They are consumed in order, one
 * per call, and the last one repeats — so a tool can fail then recover, or
 * return a different fact on each pass through the loop.
 */
function mockFor(mocks: MockInjection[], nodeId: string, callIndex: number): MockInjection | undefined {
  const forNode = mocks.filter(m => m.nodeId === nodeId);
  if (!forNode.length) return undefined;
  return forNode[Math.min(callIndex, forNode.length - 1)];
}

export interface SimState {
  facts: string[];
  retries: number;
  tokens: number;
  lastStatus: number;
  handled: boolean;
  masked: boolean;
  overBudget: boolean;
  unsafeSeen: boolean;
}

export interface TraceStep {
  index: number;
  nodeId: string;
  label: string;
  kind: GraphNode['kind'];
  /** Human-readable line for the console. */
  line: string;
  /** Terminal-style channel used for colouring. */
  channel: 'sys' | 'agent' | 'tool' | 'guard' | 'warn' | 'err' | 'ok';
  state: SimState;
  /** Condition taken to leave this node, if any. */
  took?: EdgeCondition;
}

export type SimStatus = 'terminated' | 'infinite_cycle' | 'stuck' | 'token_limit' | 'unsafe_exit' | 'empty';

export interface SimResult {
  status: SimStatus;
  steps: TraceStep[];
  output: string | null;
  tokens: number;
  visited: string[];
  /** True if the run produced a structured, non-empty final answer. */
  producedOutcome: boolean;
}

const MAX_STEPS = 48;

function evalCondition(cond: EdgeCondition, graph: AgentGraph, s: SimState): boolean {
  switch (cond) {
    case 'always':
      return true;
    case 'needs_info':
      return s.facts.length < graph.requiredFacts;
    case 'satisfied':
      return s.facts.length >= graph.requiredFacts;
    case 'on_success':
      return s.lastStatus > 0 && s.lastStatus < 400;
    case 'on_error':
      return s.lastStatus >= 400;
    case 'retry_available':
      return s.retries < graph.maxRetries;
    case 'budget_exceeded':
      return s.overBudget;
    case 'unsafe_input':
      return s.unsafeSeen && !s.handled;
    case 'safe_input':
      return !s.unsafeSeen || s.handled;
    default:
      return false;
  }
}

function hasOutcomeContract(node: GraphNode): boolean {
  return (node.itols?.outcome ?? '').trim().length >= 8;
}

function hasSecurityContract(node: GraphNode): boolean {
  return (node.itols?.security ?? '').trim().length >= 8;
}

export function simulate(graph: AgentGraph, mocks: MockInjection[]): SimResult {
  const entries = entryNodes(graph);
  if (!entries.length || !graph.nodes.length) {
    return { status: 'empty', steps: [], output: null, tokens: 0, visited: [], producedOutcome: false };
  }

  const state: SimState = {
    facts: [],
    retries: 0,
    tokens: 0,
    lastStatus: 0,
    handled: false,
    masked: false,
    overBudget: false,
    unsafeSeen: false,
  };

  const steps: TraceStep[] = [];
  const visited: string[] = [];
  const visitCount = new Map<string, number>();
  let current: GraphNode | undefined = entries[0];
  let status: SimStatus = 'stuck';
  let output: string | null = null;

  const snap = (): SimState => ({ ...state, facts: [...state.facts] });

  const record = (node: GraphNode, line: string, channel: TraceStep['channel'], took?: EdgeCondition) => {
    steps.push({
      index: steps.length,
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      line,
      channel,
      state: snap(),
      took,
    });
  };

  while (current && steps.length < MAX_STEPS) {
    const node: GraphNode = current;
    visited.push(node.id);
    visitCount.set(node.id, (visitCount.get(node.id) ?? 0) + 1);
    state.tokens += KIND_META[node.kind].cost;
    if (state.tokens > graph.budget) state.overBudget = true;

    switch (node.kind) {
      case 'entry':
        record(node, 'request received → "Summarise the state of quantum computing."', 'sys');
        break;

      case 'agent': {
        const contract = hasOutcomeContract(node);
        const detail = contract
          ? `plan: ${state.facts.length}/${graph.requiredFacts} facts held, outcome contract present`
          : `plan: ${state.facts.length}/${graph.requiredFacts} facts held, NO outcome contract — cannot decide to stop`;
        record(node, `${node.label} thinking · ${detail}`, contract ? 'agent' : 'warn');
        if (state.unsafeSeen && !hasSecurityContract(node)) {
          record(node, 'adversarial instruction from tool output was treated as a user instruction', 'err');
        }
        break;
      }

      case 'tool': {
        const mock = mockFor(mocks, node.id, (visitCount.get(node.id) ?? 1) - 1);
        const st = mock?.status ?? 200;
        state.lastStatus = st;
        if (st >= 400) {
          state.retries += 1;
          record(node, `${node.label} → ${st} ${mock?.data ?? 'upstream failure'} (retry ${state.retries}/${graph.maxRetries})`, 'err');
        } else {
          const data = mock?.data ?? 'result payload';
          if (!state.facts.includes(data)) state.facts.push(data);
          record(node, `${node.label} → 200 ${data}`, 'tool');
          if (mock?.injectedInstruction) {
            state.unsafeSeen = true;
            record(node, `payload contains an embedded instruction: "${mock.injectedInstruction}"`, 'warn');
          }
        }
        break;
      }

      case 'guard': {
        state.handled = true;
        if (hasSecurityContract(node)) {
          state.masked = true;
          record(node, `${node.label} applied: guardrails enforced, untrusted content demoted to data`, 'guard');
        } else {
          record(node, `${node.label} reached but its Security field is empty — it passes everything through`, 'warn');
        }
        break;
      }

      case 'memory':
        record(node, `${node.label} persisted ${state.facts.length} fact(s) across the iteration`, 'sys');
        break;

      case 'condition':
        record(node, `${node.label} evaluating state`, 'sys');
        break;

      case 'terminal': {
        const producer = [...graph.nodes]
          .filter(n => n.kind === 'agent' && hasOutcomeContract(n))
          .pop();
        if (producer && state.facts.length > 0) {
          output = `{ "final_summary": "${state.facts.join(' ')}" }`;
          record(node, `terminal output ${output}`, 'ok');
          status = state.unsafeSeen && !state.masked ? 'unsafe_exit' : 'terminated';
        } else if (state.facts.length === 0) {
          output = null;
          record(node, 'terminal reached with an empty result set — no facts were ever collected', 'warn');
          status = 'terminated';
        } else {
          output = `"${state.facts.join(' ')}"`;
          record(node, `terminal output ${output} (unstructured — no Outcome schema was declared)`, 'warn');
          status = 'terminated';
        }
        current = undefined;
        continue;
      }
    }

    if (state.overBudget && status === 'stuck') {
      const budgetEdge = outgoing(graph, node.id).find(e => e.condition === 'budget_exceeded');
      if (!budgetEdge) {
        record(node, `token budget of ${graph.budget} exceeded at ${state.tokens} with no budget route`, 'err');
        status = 'token_limit';
        break;
      }
    }

    if ((visitCount.get(node.id) ?? 0) > 8) {
      record(node, `"${node.label}" has been re-entered 9 times — this loop does not converge`, 'err');
      status = 'infinite_cycle';
      break;
    }

    const edges = outgoing(graph, node.id);
    // Over budget, a cost route always wins: that is the whole point of having one.
    const ordered = state.overBudget
      ? [...edges].sort((a, b) => Number(b.condition === 'budget_exceeded') - Number(a.condition === 'budget_exceeded'))
      : edges;
    const chosen = ordered.find(e => evalCondition(e.condition, graph, state));
    if (!chosen) {
      record(node, edges.length ? 'no outgoing condition evaluated true — execution stalls here' : 'dead end — nothing to execute next', 'err');
      status = 'stuck';
      break;
    }
    steps[steps.length - 1].took = chosen.condition;
    current = graph.nodes.find(n => n.id === chosen.target);
    if (!current) {
      status = 'stuck';
      break;
    }
  }

  if (steps.length >= MAX_STEPS && status === 'stuck') status = 'infinite_cycle';

  return {
    status,
    steps,
    output,
    tokens: state.tokens,
    visited,
    producedOutcome: status === 'terminated' && !!output && output.includes('final_summary'),
  };
}
