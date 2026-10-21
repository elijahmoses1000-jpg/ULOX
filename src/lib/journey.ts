// The Journey: the one ordered spine of UloX.
//
// Everything else in the app — roadmaps, tactics, the Lab, the Toolkit — is a
// place you *can* go. This is the place you *should* go next. A learner who
// opens UloX should never have to choose between nine doors; they should see one
// sentence telling them what to do and one button that does it.
//
// Six disciplines, in the order they actually build on each other: you cannot
// engineer a loop before you can engineer the single call inside it.

import { PUZZLE_BY_ID } from './puzzles';
import { TOPIC_BY_ID } from './curriculum';
import type { Profile } from './profile';

export type StageId = 'prompt' | 'context' | 'harness' | 'loop' | 'graph' | 'agentic';

export interface Stage {
  id: StageId;
  /** 1-based position. The ladder is the product; the number is load-bearing. */
  n: number;
  title: string;
  /** The discipline's real name, for people who want it. */
  formal: string;
  /** What you can do once this is done, in the learner's words. */
  promise: string;
  /** Why it comes here and not somewhere else. */
  why: string;
  hex: string;
  /** Curriculum topic ids — the reading. */
  topics: string[];
  /** Tactic ids — the practice. Every tactic belongs to exactly one stage. */
  drills: string[];
  /** Pattern preset to construct in the Lab — the doing. */
  build: string;
  buildLabel: string;
  /**
   * Cheatsheet ids from ai-engineering-from-scratch. One-page references for
   * this discipline, for the learner who wants the dense version rather than
   * the guided one.
   */
  notes: string[];
}

/** Where the field notes are read from. */
export const NOTES_REPO = 'rohitg00/ai-engineering-from-scratch';

export function noteUrl(id: string): string {
  return `https://github.com/${NOTES_REPO}/blob/main/cheatsheets/${id}.md`;
}

export function noteTitle(id: string): string {
  return id
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * The colour ramp walks from green through to violet across the six stages, so
 * "how far along am I" is legible at a glance before a single word is read.
 */
export const STAGES: Stage[] = [
  {
    id: 'prompt',
    n: 1,
    title: 'Ask properly',
    formal: 'Prompt engineering',
    promise: 'Get a model to do exactly what you asked — the same way every time.',
    why: 'Everything above this is a loop around a single call. If that call is unreliable, nothing built on it can be.',
    hex: '#3FD07A',
    topics: ['ai-agents', 'prompt-engineering', 'itols', 'itols-writing'],
    drills: ['pzl_no_entry', 'pzl_format_brittle', 'pzl_identity_drift'],
    build: 'blank',
    buildLabel: 'Write a complete contract for one agent',
    notes: ['prompt-engineering', 'agent-skills'],
  },
  {
    id: 'context',
    n: 2,
    title: 'Feed it the right things',
    formal: 'Context engineering',
    promise: 'Give a model exactly the information it needs, and nothing that will mislead it.',
    why: 'A perfect instruction with the wrong context still fails. This is where most real systems break first.',
    hex: '#52C98B',
    topics: ['memory', 'rag', 'embeddings', 'few-shot'],
    drills: ['pzl_amnesiac', 'pzl_prompt_injection'],
    build: 'react',
    buildLabel: 'Build a loop that accumulates what it learns',
    notes: ['context-engineering', 'rag', 'embeddings-vector-search'],
  },
  {
    id: 'harness',
    n: 3,
    title: 'Give it hands',
    formal: 'Harness engineering',
    promise: 'Wire a model to real tools, with contracts that hold and failures that surface.',
    why: 'A model that cannot act is a chatbot. The harness is everything between the model and the world.',
    hex: '#4EA8FF',
    topics: ['tool-binding', 'error-handling', 'llm-basics'],
    drills: ['pzl_type_mismatch', 'pzl_silent_failure', 'pzl_retry_storm'],
    build: 'guarded',
    buildLabel: 'Cover a tool’s failure surface with a guard',
    notes: ['agent-harness', 'agent-tool-use-skills', 'mcp'],
  },
  {
    id: 'loop',
    n: 4,
    title: 'Let it keep going',
    formal: 'Loop engineering',
    promise: 'Let a system act repeatedly — and know exactly when to stop.',
    why: 'This is the step that turns a tool call into an agent, and the one that produces runaway bills when it is skipped.',
    hex: '#7B8EFF',
    topics: ['agentic-loops', 'cost-control', 'reliability'],
    drills: ['pzl_infinite_researcher', 'pzl_no_exit', 'pzl_stuck_router'],
    build: 'budgeted',
    buildLabel: 'Build a loop that degrades instead of exploding',
    notes: ['agent-planning', 'agent-reasoning-patterns', 'agent-failure-modes'],
  },
  {
    id: 'graph',
    n: 5,
    title: 'Route many steps',
    formal: 'Graph engineering',
    promise: 'Branch, merge and guard many steps so control flow stays deterministic.',
    why: 'One loop is a line. Real systems are graphs, and a graph with an ambiguous branch is a race condition.',
    hex: '#9B7BFF',
    topics: ['routing', 'reflexion', 'decomposition'],
    drills: ['pzl_ambiguous_router', 'pzl_orphan_branch', 'pzl_double_loop'],
    build: 'router',
    buildLabel: 'Route work down mutually exclusive branches',
    notes: ['agent-state-graphs', 'orchestration-patterns', 'multi-agent'],
  },
  {
    id: 'agentic',
    n: 6,
    title: 'Ship it safely',
    formal: 'Agentic engineering',
    promise: 'Put it together: bounded, observable systems that fail safe under attack.',
    why: 'The last discipline is the one that decides whether any of the others are allowed near production.',
    hex: '#B57BFF',
    topics: ['prompt-injection', 'guardrails', 'excessive-agency', 'evals'],
    drills: ['pzl_guard_theatre', 'pzl_unbounded_delegation', 'pzl_budget_blind', 'pzl_token_bonfire'],
    build: 'supervisor',
    buildLabel: 'Delegate without handing over the keys',
    notes: ['eval-driven-agents', 'ai-safety', 'genai-observability', 'agent-benchmarks'],
  },
];

export const STAGE_BY_ID = new Map(STAGES.map(s => [s.id, s]));

const BUILT_KEY = 'ulox.built.v1';

/** Which stage builds the learner has completed in the Lab. */
export function readBuilt(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(BUILT_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function markBuilt(stageId: StageId) {
  try {
    const all = readBuilt();
    all[stageId] = true;
    localStorage.setItem(BUILT_KEY, JSON.stringify(all));
  } catch {
    /* private mode — the stage just will not tick off */
  }
}

export interface StageProgress {
  stage: Stage;
  topicsDone: number;
  topicsTotal: number;
  drillsDone: number;
  drillsTotal: number;
  built: boolean;
  /** 0..1 across reading, practice and the build. */
  ratio: number;
  complete: boolean;
}

export function stageProgress(stage: Stage, profile: Profile, built: Record<string, boolean>): StageProgress {
  const topics = stage.topics.filter(id => TOPIC_BY_ID.has(id));
  const drills = stage.drills.filter(id => PUZZLE_BY_ID.has(id));
  const topicsDone = topics.filter(id => profile.topics[id] === 'done').length;
  const drillsDone = drills.filter(id => profile.solved[id]).length;
  const isBuilt = !!built[stage.id];

  const units = topics.length + drills.length + 1;
  const done = topicsDone + drillsDone + (isBuilt ? 1 : 0);

  return {
    stage,
    topicsDone,
    topicsTotal: topics.length,
    drillsDone,
    drillsTotal: drills.length,
    built: isBuilt,
    ratio: units ? done / units : 0,
    complete: topicsDone === topics.length && drillsDone === drills.length && isBuilt,
  };
}

export function journeyProgress(profile: Profile, built: Record<string, boolean>): StageProgress[] {
  return STAGES.map(stage => stageProgress(stage, profile, built));
}

export type NextKind = 'read' | 'drill' | 'build' | 'done';

export interface NextStep {
  kind: NextKind;
  stage: Stage;
  /** Button text — always a verb the user recognises. */
  action: string;
  /** What this specific thing is. */
  label: string;
  /** One line on why it is next. */
  because: string;
  to: string;
}

/**
 * The single most important function in the app: given where someone is, what
 * is the one next thing? Reading first, then practice, then build — because
 * being shown an idea, using it, then making something with it is the order
 * that makes it stick.
 */
export function nextStep(profile: Profile, built: Record<string, boolean>): NextStep {
  for (const stage of STAGES) {
    const p = stageProgress(stage, profile, built);
    if (p.complete) continue;

    const topic = stage.topics.find(id => TOPIC_BY_ID.has(id) && profile.topics[id] !== 'done');
    if (topic) {
      const node = TOPIC_BY_ID.get(topic)!;
      return {
        kind: 'read',
        stage,
        action: 'Read this',
        label: node.title,
        because: `Step ${stage.n} of ${STAGES.length} · ${stage.formal}`,
        to: `/journey/${stage.id}?topic=${topic}`,
      };
    }

    const drill = stage.drills.find(id => PUZZLE_BY_ID.has(id) && !profile.solved[id]);
    if (drill) {
      const puzzle = PUZZLE_BY_ID.get(drill)!;
      return {
        kind: 'drill',
        stage,
        action: 'Fix this one',
        label: puzzle.title,
        because: `Step ${stage.n} of ${STAGES.length} · ${stage.formal}`,
        to: `/train/${drill}`,
      };
    }

    return {
      kind: 'build',
      stage,
      action: 'Build it',
      label: stage.buildLabel,
      because: `Step ${stage.n} of ${STAGES.length} · ${stage.formal}`,
      to: `/lab/${stage.build}?stage=${stage.id}`,
    };
  }

  return {
    kind: 'done',
    stage: STAGES[STAGES.length - 1],
    action: 'Play someone',
    label: 'You have finished the journey',
    because: 'All six disciplines complete',
    to: '/play',
  };
}

/** Which stage a tactic belongs to, so a puzzle page can say where it sits. */
export function stageForDrill(puzzleId: string): Stage | undefined {
  return STAGES.find(s => s.drills.includes(puzzleId));
}
