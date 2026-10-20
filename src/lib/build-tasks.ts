// What you actually build, and how the app knows you built it.
//
// The Build screen used to open the *finished* pattern and offer a "Mark built"
// button. There was nothing to do, nothing to aim at, and no way to tell you
// were done — which is why people stopped there.
//
// So each stage now has a task: a graph that is deliberately missing the pieces
// the stage teaches, and an ordered list of goals checked live against what you
// have on the canvas. One goal is highlighted at a time, the same single-next-
// step spine the rest of the app uses. The stage is only marked built when
// every goal passes, so the certificate's build flag means something.
//
// scripts/audit.ts proves each task is completable by checking that the
// canonical pattern satisfies every goal, and that the starting graph does not
// — a task you cannot finish, or one that is already finished, both fail.

import { AgentGraph, EdgeCondition, ItolsKey, NodeKind, cloneGraph } from './agentic';
import { PATTERN_BY_ID, blankGraph } from './patterns';
import { StageId } from './journey';

export interface Goal {
  id: string;
  /** Imperative, plain language. What to do, in one line. */
  title: string;
  /** Why it matters — the actual lesson, in one sentence. */
  why: string;
  /**
   * How to do it, when the gesture is not obvious. Set this wherever the edge
   * you are asked for does not match the condition the app picks by default —
   * `defaultCondition()` gives agent→guard "tool errored" and guard→tool
   * "always", so those goals need a second step nobody would guess.
   */
  how?: string;
  check: (graph: AgentGraph) => boolean;
}

export interface BuildTask {
  stage: StageId;
  /** The pattern this task builds towards. */
  pattern: string;
  /** One sentence: what you are making, in plain words. */
  making: string;
  /** What is already on the canvas when you arrive. */
  youHave: string;
  startGraph: () => AgentGraph;
  goals: Goal[];
}

// --- small readable predicates ---------------------------------------------

const nodesOf = (g: AgentGraph, kind: NodeKind) => g.nodes.filter(n => n.kind === kind);
const has = (g: AgentGraph, kind: NodeKind) => nodesOf(g, kind).length > 0;

/** Is there an edge from a node of `from` kind to one of `to` kind, on `cond`? */
function wired(g: AgentGraph, from: NodeKind, to: NodeKind, cond?: EdgeCondition): boolean {
  return g.edges.some(e => {
    const s = g.nodes.find(n => n.id === e.source);
    const t = g.nodes.find(n => n.id === e.target);
    if (!s || !t || s.kind !== from || t.kind !== to) return false;
    return cond ? e.condition === cond : true;
  });
}

/** Does some node of this kind have real text in that contract field? */
function filled(g: AgentGraph, kind: NodeKind, key: ItolsKey, min = 12): boolean {
  return nodesOf(g, kind).some(n => (n.itols?.[key] ?? '').trim().length >= min);
}

/** Every node of this kind has the field filled — used where one gap defeats the point. */
function allFilled(g: AgentGraph, kind: NodeKind, key: ItolsKey, min = 12): boolean {
  const list = nodesOf(g, kind);
  return list.length > 0 && list.every(n => (n.itols?.[key] ?? '').trim().length >= min);
}

/** Conditions leaving a given node, so exclusivity can be checked. */
function outgoing(g: AgentGraph, nodeId: string) {
  return g.edges.filter(e => e.source === nodeId);
}

/** The agent no other agent delegates to — i.e. the top of the chain. */
function supervisorOf(g: AgentGraph) {
  const agents = nodesOf(g, 'agent');
  return agents.find(a => !g.edges.some(e => e.target === a.id && agents.some(x => x.id === e.source)));
}

/**
 * Build the starting graph by removing named pieces from the finished pattern.
 * Deriving rather than re-declaring keeps the pattern the single source of
 * truth: change the pattern and the task moves with it.
 */
function strip(
  patternId: string,
  drop: {
    nodes?: string[];
    edges?: string[];
    clear?: Array<[string, ItolsKey[]]>;
    /** Edges to ADD — for tasks whose lesson is removing a wrong connection. */
    add?: Array<[id: string, source: string, target: string, condition: EdgeCondition]>;
  },
): AgentGraph {
  const pattern = PATTERN_BY_ID.get(patternId);
  if (!pattern) throw new Error(`unknown pattern: ${patternId}`);
  const g = cloneGraph(pattern.graph);
  const dropNodes = new Set(drop.nodes ?? []);
  const dropEdges = new Set(drop.edges ?? []);

  g.nodes = g.nodes.filter(n => !dropNodes.has(n.id));
  // Removing a node must remove its edges too, or the graph is left dangling.
  g.edges = g.edges.filter(e => !dropEdges.has(e.id) && !dropNodes.has(e.source) && !dropNodes.has(e.target));

  for (const [nodeId, keys] of drop.clear ?? []) {
    const node = g.nodes.find(n => n.id === nodeId);
    if (node?.itols) for (const key of keys) node.itols[key] = '';
  }
  for (const [id, source, target, condition] of drop.add ?? []) {
    g.edges.push({ id, source, target, condition });
  }
  return g;
}

// --- the six tasks ----------------------------------------------------------

export const BUILD_TASKS: BuildTask[] = [
  {
    stage: 'prompt',
    pattern: 'blank',
    making: 'One agent with a contract complete enough to test.',
    youHave: 'A request coming in, and an agent with five empty fields.',
    startGraph: () => blankGraph(),
    goals: [
      {
        id: 'identity',
        title: 'Tell the agent who it is',
        why: 'Without an identity the model picks one for you, and it changes between runs.',
        check: g => filled(g, 'agent', 'identity'),
      },
      {
        id: 'tasks',
        title: 'Tell it what it must do',
        why: 'A task list is the difference between an instruction and a suggestion.',
        check: g => filled(g, 'agent', 'tasks'),
      },
      {
        id: 'outcome',
        title: 'Say how it knows it is finished',
        why: 'An agent with no finish line cannot stop. This one field prevents most runaway loops.',
        check: g => filled(g, 'agent', 'outcome'),
      },
      {
        id: 'language',
        title: 'Say how it must reply',
        why: 'If the shape of the answer is not stated, whatever reads it next will eventually break.',
        check: g => filled(g, 'agent', 'language'),
      },
      {
        id: 'security',
        title: 'Say what it must never do',
        why: 'The one field people skip, and the one an attacker is counting on.',
        check: g => filled(g, 'agent', 'security'),
      },
      {
        id: 'exit',
        title: 'Add an Output and connect the agent to it when satisfied',
        why: 'A contract with no way out is still a trap.',
        check: g => has(g, 'terminal') && wired(g, 'agent', 'terminal', 'satisfied'),
      },
    ],
  },

  {
    stage: 'context',
    pattern: 'react',
    making: 'A loop that goes and finds what it does not know, then stops.',
    youHave: 'A request, an agent with a filled-in contract, and somewhere to put the answer — with nothing joining them up yet.',
    // The exit edge comes out too: wiring the whole loop is the lesson, and a
    // goal that is already ticked on arrival teaches nothing.
    startGraph: () => strip('react', { nodes: ['n2'], edges: ['e3'] }),
    goals: [
      {
        id: 'tool',
        title: 'Add a Tool the agent can call for facts',
        why: 'A model cannot look anything up. Everything it does not already hold has to arrive through a tool.',
        check: g => has(g, 'tool'),
      },
      {
        id: 'ask',
        title: 'Connect Agent → Tool on “needs info”',
        why: 'The condition is the decision. "Needs info" is what makes this a loop rather than a straight line.',
        how: "Tap the ⊕ handle on the first node, then tap the second. This pair already defaults to “needs info”.",
        check: g => wired(g, 'agent', 'tool', 'needs_info'),
      },
      {
        id: 'return',
        title: 'Connect Tool → Agent on “tool succeeded”',
        why: 'Return on “always” and a failed call looks exactly like a good one. This is the most common bug in the whole course.',
        how: "Tap the ⊕ handle on the first node, then tap the second. A tool already defaults to “tool succeeded”.",
        check: g => wired(g, 'tool', 'agent', 'on_success') && !wired(g, 'tool', 'agent', 'always'),
      },
      {
        id: 'stop',
        title: 'Connect Agent → Output on “satisfied”',
        why: 'The loop needs a door. Without it the agent keeps searching after it already has the answer.',
        how: "Tap the ⊕ handle on the first node, then tap the second. Agent → Output already defaults to “satisfied”.",
        check: g => wired(g, 'agent', 'terminal', 'satisfied'),
      },
    ],
  },

  {
    stage: 'harness',
    pattern: 'guarded',
    making: 'The same loop, but it survives the tool failing.',
    youHave: 'A working loop. It has no idea what to do when the tool returns an error.',
    startGraph: () => strip('guarded', { nodes: ['n3'] }),
    goals: [
      {
        id: 'guard',
        title: 'Add a Guard',
        why: 'Something has to catch the error. If nothing does, the agent treats the failure as data.',
        check: g => has(g, 'guard'),
      },
      {
        id: 'catch',
        title: 'Connect Tool → Guard on “tool errored”',
        why: 'This is the failure surface. Until it is wired, every outage reaches the agent as a fact.',
        how: "Tap the ⊕ handle on the first node, then tap the second. Anything into a Guard already defaults to “tool errored”.",
        check: g => wired(g, 'tool', 'guard', 'on_error'),
      },
      {
        id: 'enforce',
        title: 'Give the Guard a Security line',
        why: 'A guard that only logs is guard theatre — the most common agent vulnerability there is.',
        check: g => allFilled(g, 'guard', 'security'),
      },
      {
        id: 'retry',
        title: 'Connect Guard → Tool on “retry available”',
        why: 'Bounded retry. On “always” you have turned a brief outage into an infinite loop.',
        how: "Tap the ⊕ handle on the first node, then tap the second. It will default to “always” — tap the new arrow and change it to “retry available”.",
        check: g => wired(g, 'guard', 'tool', 'retry_available') && !wired(g, 'guard', 'tool', 'always'),
      },
      {
        id: 'degrade',
        title: 'Connect Guard → Output',
        why: 'When the retries are spent, answer with what you have. A stall is worse than a partial answer.',
        how: "Tap the ⊕ handle on the first node, then tap the second.",
        check: g => wired(g, 'guard', 'terminal'),
      },
    ],
  },

  {
    stage: 'loop',
    pattern: 'budgeted',
    making: 'A long-running loop that remembers, and that gives up gracefully.',
    youHave: 'A research loop that calls its tool but never gets the result back, and has no cost ceiling.',
    startGraph: () => strip('budgeted', { nodes: ['n3'], edges: ['e5'] }),
    goals: [
      {
        id: 'memory',
        title: 'Add a Memory node',
        why: 'Without it the agent re-learns the same fact every turn and never reaches its target.',
        check: g => has(g, 'memory'),
      },
      {
        id: 'store',
        title: 'Connect Tool → Memory on “tool succeeded”',
        why: 'Facts get written down only when they actually arrived.',
        how: "Tap the ⊕ handle on the first node, then tap the second. A tool already defaults to “tool succeeded”.",
        check: g => wired(g, 'tool', 'memory', 'on_success'),
      },
      {
        id: 'recall',
        title: 'Connect Memory → Agent',
        why: 'Storing without reading back is just a slower way of forgetting.',
        how: "Tap the ⊕ handle on the first node, then tap the second.",
        check: g => wired(g, 'memory', 'agent'),
      },
      {
        id: 'budget',
        title: 'Connect Agent → Output on “budget exceeded”',
        why: 'The difference between a run that degrades to a partial answer and one that dies at the token limit.',
        how: "Tap the ⊕ handle on the first node, then tap the second. It will default to “satisfied” — tap the new arrow and change it to “budget exceeded”.",
        check: g => wired(g, 'agent', 'terminal', 'budget_exceeded'),
      },
    ],
  },

  {
    stage: 'graph',
    pattern: 'router',
    making: 'One classifier that sends work down branches which cannot both fire.',
    youHave: 'A router with a single branch, which is not yet a decision.',
    startGraph: () => strip('router', { nodes: ['n3'] }),
    goals: [
      {
        id: 'second',
        title: 'Add a second branch — a Guard for anything unsafe',
        why: 'One branch is a pipeline. Routing starts at two.',
        check: g => has(g, 'guard'),
      },
      {
        id: 'route-unsafe',
        title: 'Connect Router → Guard on “unsafe input”',
        why: 'The branch condition is the classification. Make it explicit and it becomes testable.',
        how: "Tap the ⊕ handle on the first node, then tap the second. It will default to “tool errored” — tap the new arrow and change it to “unsafe input”.",
        check: g => wired(g, 'agent', 'guard', 'unsafe_input'),
      },
      {
        id: 'exclusive',
        title: 'Make sure no two branches leave the router on the same condition',
        why: 'Two edges matching at once is a race, not a decision — and it picks differently between runs.',
        check: g => {
          const routers = nodesOf(g, 'agent');
          return routers.every(r => {
            const conds = outgoing(g, r.id).map(e => e.condition);
            return new Set(conds).size === conds.length;
          });
        },
      },
      {
        id: 'converge',
        title: 'Give every branch a way to the Output',
        why: 'A branch that cannot finish is where unclassifiable requests go to stall.',
        check: g => {
          const out = nodesOf(g, 'terminal').map(n => n.id);
          if (!out.length) return false;
          // Walk forward from each branch head and confirm an Output is reachable.
          const reaches = (startId: string) => {
            const seen = new Set<string>([startId]);
            const stack = [startId];
            while (stack.length) {
              const id = stack.pop()!;
              if (out.includes(id)) return true;
              for (const e of g.edges.filter(x => x.source === id)) {
                if (!seen.has(e.target)) { seen.add(e.target); stack.push(e.target); }
              }
            }
            return false;
          };
          return g.nodes.filter(n => n.kind === 'guard' || n.kind === 'tool').every(n => reaches(n.id));
        },
      },
    ],
  },

  {
    stage: 'agentic',
    pattern: 'supervisor',
    making: 'A supervisor that delegates work without handing over its permissions.',
    youHave: 'A supervisor and a worker — but the supervisor is also wired straight to the tool, so it holds the permission itself.',
    // The lesson here is removing a connection, not adding one, so the task
    // starts with the over-permissioned edge already in place.
    startGraph: () =>
      strip('supervisor', {
        clear: [['n1', ['security']], ['n2', ['tasks']]],
        add: [['x0', 'n1', 'n3', 'needs_info']],
      }),
    goals: [
      {
        id: 'cut',
        title: 'Cut the supervisor’s direct edge to the tool',
        why: 'Topology is the real permission boundary. A prompt is a request; an edge is a grant.',
        how: "Tap the arrow running straight from the supervisor to the tool, then remove it.",
        check: g => {
          const tools = new Set(nodesOf(g, 'tool').map(n => n.id));
          const toTool = g.edges.filter(e => tools.has(e.target)).map(e => e.source);
          const supervisor = supervisorOf(g);
          return !!supervisor && !toTool.includes(supervisor.id);
        },
      },
      {
        id: 'delegate',
        title: 'Make sure the work still reaches the tool, through the worker',
        why: 'Cutting the edge is only half of it — the job still has to get done by something holding less.',
        check: g => {
          const agents = nodesOf(g, 'agent');
          const supervisor = supervisorOf(g);
          if (!supervisor || agents.length < 2) return false;
          return agents.some(
            w =>
              w.id !== supervisor.id &&
              g.edges.some(e => e.source === w.id && nodesOf(g, 'tool').some(t => t.id === e.target)) &&
              g.edges.some(e => e.source === supervisor.id && e.target === w.id),
          );
        },
      },
      {
        id: 'scope',
        title: 'Give the Worker a Tasks line naming the one tool it may call',
        why: 'Belt and braces: the edge is the boundary, the prompt is the reminder.',
        check: g => nodesOf(g, 'agent').filter(n => (n.itols?.tasks ?? '').trim().length >= 12).length >= 2,
      },
      {
        id: 'refuse',
        title: 'Give the Supervisor a Security line refusing writes',
        why: 'The agent most likely to be talked into something is the one coordinating everything else.',
        check: g => allFilled(g, 'agent', 'security'),
      },
    ],
  },
];

export const BUILD_TASK_BY_STAGE = new Map(BUILD_TASKS.map(t => [t.stage, t]));

/** Which goals pass right now, and which single goal to point at next. */
export function evaluateTask(task: BuildTask, graph: AgentGraph) {
  const results = task.goals.map(goal => ({ goal, done: safeCheck(goal, graph) }));
  const next = results.find(r => !r.done)?.goal ?? null;
  const done = results.filter(r => r.done).length;
  return { results, next, done, total: task.goals.length, complete: done === task.goals.length };
}

/**
 * A goal that throws must not take the screen down with it — a half-built graph
 * is exactly when someone needs the checklist most.
 */
function safeCheck(goal: Goal, graph: AgentGraph): boolean {
  try {
    return goal.check(graph);
  } catch {
    return false;
  }
}
