// Success criteria live on their own so the engine can search toward a puzzle's
// goal without importing the whole tactic set, and so the puzzle checker and the
// engine can never disagree about what "solved" means.

import { AgentGraph, ItolsKey, NodeKind } from './agentic';
import { EvalReport } from './analyzer';
import { SimResult, SimStatus } from './simulator';

export interface SuccessCriteria {
  mustTerminate?: boolean;
  requireStructuredOutcome?: boolean;
  forbid?: SimStatus[];
  minScore?: number;
  requireKinds?: NodeKind[];
  requireItols?: { kind: NodeKind; keys: ItolsKey[] };
  maxTokens?: number;
  /** Analyzer issue codes that must be gone before the tactic counts as solved. */
  clearIssues?: string[];
}

export const ISSUE_COPY: Record<string, string> = {
  type_mismatch: 'a tool contract still feeds a node that expects a different shape',
  orphan: 'a node is still unreachable from the entry point',
  unguarded_cycle: 'a loop still has no guarded exit',
  ambiguous_route: 'a node still has two unconditional outgoing edges',
  no_error_path: 'a tool still has no failure route',
  dead_end: 'a node still leads nowhere',
};

export interface Verdict {
  solved: boolean;
  reasons: string[];
  passed: string[];
}

export function evaluateCriteria(
  criteria: SuccessCriteria,
  graph: AgentGraph,
  report: EvalReport,
  sim: SimResult
): Verdict {
  const reasons: string[] = [];
  const passed: string[] = [];

  if (criteria.mustTerminate) {
    if (sim.status === 'terminated') passed.push('Run reaches a terminal state');
    else reasons.push(`Run ended as "${sim.status.replace('_', ' ')}" instead of terminating cleanly`);
  }
  if (criteria.requireStructuredOutcome) {
    if (sim.producedOutcome) passed.push('Terminal emits a structured final_summary');
    else reasons.push('The terminal state did not emit a structured { final_summary } payload');
  }
  for (const forbidden of criteria.forbid ?? []) {
    if (sim.status === forbidden) reasons.push(`Forbidden behaviour observed: ${forbidden.replace('_', ' ')}`);
  }
  if (criteria.minScore !== undefined) {
    if (report.score >= criteria.minScore) passed.push(`Eval score ${report.score.toFixed(1)} clears the ${criteria.minScore.toFixed(1)} bar`);
    else reasons.push(`Eval score ${report.score.toFixed(1)} is below the required ${criteria.minScore.toFixed(1)}`);
  }
  for (const kind of criteria.requireKinds ?? []) {
    if (graph.nodes.some(n => n.kind === kind)) passed.push(`Graph contains a ${kind} node`);
    else reasons.push(`Graph still has no ${kind} node`);
  }
  if (criteria.requireItols) {
    const targets = graph.nodes.filter(n => n.kind === criteria.requireItols!.kind);
    for (const key of criteria.requireItols.keys) {
      const ok = targets.length > 0 && targets.every(n => (n.itols?.[key] ?? '').trim().length >= 8);
      if (ok) passed.push(`Every ${criteria.requireItols.kind} declares ${key}`);
      else reasons.push(`At least one ${criteria.requireItols.kind} is missing a usable ${key} contract`);
    }
  }
  for (const code of criteria.clearIssues ?? []) {
    const still = report.issues.some(i => i.code === code && i.severity !== 'good');
    const copy = ISSUE_COPY[code] ?? code.replace(/_/g, ' ');
    if (still) reasons.push(`Unresolved: ${copy}`);
    else passed.push(`Resolved: ${copy.replace('still ', '')}`);
  }
  if (criteria.maxTokens !== undefined) {
    if (sim.tokens <= criteria.maxTokens) passed.push(`Run cost ${sim.tokens} tokens, inside the ${criteria.maxTokens} ceiling`);
    else reasons.push(`Run cost ${sim.tokens} tokens against a ${criteria.maxTokens} ceiling`);
  }

  return { solved: reasons.length === 0, reasons, passed };
}

/** How close a position is to the goal, 0..1 — used to steer the engine's search. */
export function criteriaProgress(
  criteria: SuccessCriteria,
  graph: AgentGraph,
  report: EvalReport,
  sim: SimResult
): number {
  const verdict = evaluateCriteria(criteria, graph, report, sim);
  const total = verdict.passed.length + verdict.reasons.length;
  if (!total) return 1;
  return verdict.passed.length / total;
}
