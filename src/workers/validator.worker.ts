/// <reference lib="webworker" />
// Topological analysis, execution simulation and engine search all run here so
// the IDE keeps a steady frame rate while the learner drags nodes around.

import { AgentGraph } from '../lib/agentic';
import { Line, Position, bestMove, evaluate, search } from '../lib/engine';
import { MockInjection } from '../lib/simulator';
import { SuccessCriteria } from '../lib/criteria';

export interface WorkerRequest {
  id: number;
  kind: 'evaluate' | 'search' | 'hint';
  graph: AgentGraph;
  mocks: MockInjection[];
  depth?: number;
  criteria?: SuccessCriteria;
}

export interface WorkerResponse {
  id: number;
  kind: WorkerRequest['kind'];
  position?: Position;
  line?: Line;
  hint?: { description: string; value: number };
  error?: string;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === 'evaluate') {
      const position = evaluate(req.graph, req.mocks);
      (self as unknown as Worker).postMessage({ id: req.id, kind: req.kind, position } satisfies WorkerResponse);
      return;
    }
    if (req.kind === 'search') {
      const line = search(req.graph, { mocks: req.mocks, criteria: req.criteria, depth: req.depth ?? 2 });
      (self as unknown as Worker).postMessage({ id: req.id, kind: req.kind, line } satisfies WorkerResponse);
      return;
    }
    const best = bestMove(req.graph, req.mocks, req.criteria);
    (self as unknown as Worker).postMessage({
      id: req.id,
      kind: req.kind,
      hint: { description: best.description, value: best.value },
    } satisfies WorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id: req.id,
      kind: req.kind,
      error: err instanceof Error ? err.message : 'analysis failed',
    } satisfies WorkerResponse);
  }
};
