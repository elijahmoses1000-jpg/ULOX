// Skill level is the lens the whole app is read through.
//
// It is not a difficulty filter bolted onto the side: it changes the words on
// screen, how much of the interface is shown at once, and the accent colour of
// every surface. A beginner and an expert should feel like they are using two
// products that happen to share a spine.

import { create } from 'zustand';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface LevelMeta {
  id: Level;
  label: string;
  /** One line, in the user's own terms, about who this is for. */
  who: string;
  /** RGB triplet — drives --accent, so Tailwind opacity modifiers keep working. */
  rgb: string;
  hex: string;
  /** What actually changes, said plainly. Shown in the switcher. */
  changes: string[];
}

/**
 * Colour is doing real work here. Green reads as growth and safety and carries
 * the least threat, which is what someone who feels locked out needs. Blue is
 * the calm-focus hue for people past the fear who want to concentrate. Violet
 * reads as depth and mastery. Brand red is reserved for identity and the primary
 * action, because red is the highest-arousal hue and using it everywhere makes a
 * learning tool feel like an alarm.
 */
export const LEVELS: Record<Level, LevelMeta> = {
  beginner: {
    id: 'beginner',
    label: 'Beginner',
    who: 'New to AI agents. Show me plain words and one thing at a time.',
    rgb: '63 208 122',
    hex: '#3FD07A',
    changes: [
      'Plain English instead of jargon',
      'One panel at a time, nothing hidden behind tabs',
      'Hints offered before you get stuck',
    ],
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermediate',
    who: 'I have built something with an LLM. Give me the real names for things.',
    rgb: '78 168 255',
    hex: '#4EA8FF',
    changes: [
      'Standard vocabulary, with a definition on hover',
      'Full workbench: diagram, run log and score together',
      'Hints on request',
    ],
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    who: 'I ship agents. Get out of my way and show me the numbers.',
    rgb: '181 123 255',
    hex: '#B57BFF',
    changes: [
      'Precise terminology, no simplification',
      'Every metric, sub-topics and engine internals exposed',
      'No prompting — you ask, or you do not',
    ],
  },
};

export const LEVEL_ORDER: Level[] = ['beginner', 'intermediate', 'advanced'];

/**
 * The glossary. Every invented or borrowed term the interface uses, written
 * three ways. The beginner column decides whether somebody stays, so it never
 * contains a word the reader would have to look up.
 */
type Phrasing = Record<Level, string>;

export const TERMS: Record<string, Phrasing> = {
  score: { beginner: 'Health score', intermediate: 'Eval score', advanced: 'AAS' },
  scoreLong: { beginner: 'Health score', intermediate: 'Evaluation score', advanced: 'Agentic Advantage Score' },
  scorePanel: { beginner: 'How healthy is this?', intermediate: 'Evaluation', advanced: 'Agent Eval Bar' },
  scoreHelp: {
    beginner: 'Green is good, red means something is broken. Fix the problems below to push it up.',
    intermediate: 'Static analysis plus a simulated run, from -9.9 to +9.9.',
    advanced: 'Analyzer score plus execution outcome, clamped to [-9.9, +9.9].',
  },

  itols: { beginner: 'Setup checklist', intermediate: 'ITOLS checklist', advanced: 'ITOLS contract' },
  itolsHelp: {
    beginner: 'Five things every AI step needs before it can be trusted. Fill them all in.',
    intermediate: 'Identity, Tasks, Outcome, Language, Security — the five fields a reasoning node must declare.',
    advanced: 'Identity, Tasks, Outcome, Language, Security.',
  },

  tactic: { beginner: 'Puzzle', intermediate: 'Tactic', advanced: 'Tactic' },
  tactics: { beginner: 'Puzzles', intermediate: 'Tactics', advanced: 'Tactics' },
  tacticsHelp: {
    beginner: 'Small broken AI systems. Find the one thing that is wrong and fix it.',
    intermediate: 'Short forced problems in broken agent architectures.',
    advanced: 'Rated architectural tactics with bounded move budgets.',
  },

  rating: { beginner: 'Skill points', intermediate: 'Rating', advanced: 'Glicko-2 rating' },
  ratingHelp: {
    beginner: 'Goes up when you solve something hard, down when you miss an easy one.',
    intermediate: 'Your rating moves against each puzzle’s difficulty.',
    advanced: 'Glicko-2 with per-puzzle opponent ratings and volatility.',
  },

  bestLine: { beginner: 'Show me the fix', intermediate: 'Best line', advanced: 'Principal variation' },
  hint: { beginner: 'Give me a nudge', intermediate: 'Hint', advanced: 'Hint' },
  engine: { beginner: 'Helper', intermediate: 'Engine', advanced: 'Engine' },

  graph: { beginner: 'Diagram', intermediate: 'Agent graph', advanced: 'State graph' },
  node: { beginner: 'Step', intermediate: 'Node', advanced: 'Node' },
  edge: { beginner: 'Arrow', intermediate: 'Edge', advanced: 'Edge' },
  condition: { beginner: 'When to use it', intermediate: 'Condition', advanced: 'Guard condition' },
  run: { beginner: 'Try it', intermediate: 'Run', advanced: 'Simulate' },
  runLog: { beginner: 'What happened', intermediate: 'Run log', advanced: 'Execution trace' },
  moves: { beginner: 'Your changes', intermediate: 'Moves', advanced: 'Move ledger' },
  budget: { beginner: 'Cost', intermediate: 'Token budget', advanced: 'Token budget' },

  kindAgent: { beginner: 'Thinking step', intermediate: 'Agent', advanced: 'Agent' },
  kindTool: { beginner: 'Tool', intermediate: 'Tool', advanced: 'Tool' },
  kindGuard: { beginner: 'Safety check', intermediate: 'Guard', advanced: 'Guard' },
  kindMemory: { beginner: 'Notepad', intermediate: 'Memory', advanced: 'Memory' },
  kindCondition: { beginner: 'Fork in the road', intermediate: 'Router', advanced: 'Router' },
  kindTerminal: { beginner: 'Finish', intermediate: 'Output', advanced: 'Terminal' },
  kindEntry: { beginner: 'Start', intermediate: 'Entry', advanced: 'Entry' },

  outTerminated: { beginner: 'It finished', intermediate: 'Halted cleanly', advanced: 'terminated' },
  outInfinite: { beginner: 'It never stops', intermediate: 'Loops forever', advanced: 'infinite_cycle' },
  outStuck: { beginner: 'It gets stuck', intermediate: 'Stalls', advanced: 'stuck' },
  outBudget: { beginner: 'It costs too much', intermediate: 'Runs out of budget', advanced: 'token_limit' },
  outUnsafe: { beginner: 'It got tricked', intermediate: 'Unsafe output', advanced: 'unsafe_exit' },
  outEmpty: { beginner: 'Nothing to run', intermediate: 'No entry point', advanced: 'empty' },

  lab: { beginner: 'Workshop', intermediate: 'Lab', advanced: 'Lab' },
  arena: { beginner: 'Play a friend', intermediate: 'Arena', advanced: 'Arena' },
  patterns: { beginner: 'Recipes', intermediate: 'Patterns', advanced: 'Pattern book' },
};

export function term(key: string, level: Level): string {
  const entry = TERMS[key];
  return entry ? entry[level] : key;
}

// ---------------------------------------------------------------------------

const KEY = 'ulox.level.v1';
const SEEN_KEY = 'ulox.onboarded.v1';

function readLevel(): Level | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'beginner' || raw === 'intermediate' || raw === 'advanced' ? raw : null;
  } catch {
    return null;
  }
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Paint the accent on the document so plain CSS can use it too. */
export function applyLevelTheme(level: Level) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.level = level;
  root.style.setProperty('--accent', LEVELS[level].rgb);
}

interface LevelState {
  level: Level;
  onboarded: boolean;
  /** False until the person has actively picked a level. */
  chosen: boolean;
  setLevel: (level: Level) => void;
  finishOnboarding: () => void;
  replayOnboarding: () => void;
  t: (key: string) => string;
}

const initial = readLevel();

export const useLevel = create<LevelState>((set, get) => ({
  level: initial ?? 'beginner',
  onboarded: readSeen(),
  chosen: initial !== null,

  setLevel: level => {
    try {
      localStorage.setItem(KEY, level);
    } catch {
      /* private mode */
    }
    applyLevelTheme(level);
    set({ level, chosen: true });
  },

  finishOnboarding: () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    set({ onboarded: true });
  },

  replayOnboarding: () => set({ onboarded: false }),

  t: key => term(key, get().level),
}));

applyLevelTheme(initial ?? 'beginner');
