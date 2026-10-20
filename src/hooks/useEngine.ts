import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentGraph } from '../lib/agentic';
import { Line, Position, bestMove, evaluate, search } from '../lib/engine';
import { MockInjection } from '../lib/simulator';
import { SuccessCriteria } from '../lib/criteria';
import type { WorkerRequest, WorkerResponse } from '../workers/validator.worker';

/**
 * Drives the analysis worker. If the browser refuses to spawn a module worker
 * the same pure functions run inline, so the eval bar is never dead.
 */
export function useEngine(graph: AgentGraph, mocks: MockInjection[], criteria?: SuccessCriteria, debounceMs = 260) {
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const pendingRef = useRef(new Map<number, (res: WorkerResponse) => void>());

  const [position, setPosition] = useState<Position>(() => evaluate(graph, mocks));
  const [thinking, setThinking] = useState(false);
  const [line, setLine] = useState<Line | null>(null);

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/validator.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const resolve = pendingRef.current.get(event.data.id);
        if (resolve) {
          pendingRef.current.delete(event.data.id);
          resolve(event.data);
        }
      };
      worker.onerror = () => {
        worker?.terminate();
        workerRef.current = null;
      };
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
    }
    return () => {
      worker?.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const ask = useCallback((req: Omit<WorkerRequest, 'id'>): Promise<WorkerResponse> => {
    const worker = workerRef.current;
    const id = (seqRef.current += 1);
    if (!worker) {
      // Inline fallback keeps every feature working without a worker.
      if (req.kind === 'evaluate') return Promise.resolve({ id, kind: req.kind, position: evaluate(req.graph, req.mocks) });
      if (req.kind === 'search') return Promise.resolve({ id, kind: req.kind, line: search(req.graph, { mocks: req.mocks, criteria: req.criteria, depth: req.depth ?? 2 }) });
      const best = bestMove(req.graph, req.mocks, req.criteria);
      return Promise.resolve({ id, kind: req.kind, hint: { description: best.description, value: best.value } });
    }
    return new Promise(resolve => {
      pendingRef.current.set(id, resolve);
      worker.postMessage({ ...req, id } satisfies WorkerRequest);
      window.setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          resolve({ id, kind: req.kind, error: 'timeout' });
        }
      }, 8000);
    });
  }, []);

  // Re-evaluate whenever the position changes.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const res = await ask({ kind: 'evaluate', graph, mocks });
      if (!cancelled && res.position) setPosition(res.position);
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [graph, mocks, ask, debounceMs]);

  const runSearch = useCallback(
    async (depth = 2) => {
      setThinking(true);
      const res = await ask({ kind: 'search', graph, mocks, criteria, depth });
      setThinking(false);
      if (res.line) {
        setLine(res.line);
        return res.line;
      }
      return null;
    },
    [ask, graph, mocks, criteria]
  );

  const requestHint = useCallback(async () => {
    setThinking(true);
    const res = await ask({ kind: 'hint', graph, mocks, criteria });
    setThinking(false);
    return res.hint ?? null;
  }, [ask, graph, mocks, criteria]);

  return { position, line, thinking, runSearch, requestHint, setLine };
}
