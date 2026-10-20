import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Lightbulb } from 'lucide-react';
import { KIND_META, Move, NodeKind, defaultCondition } from '../lib/agentic';
import { Position } from '../lib/engine';
import { useEngine } from '../hooks/useEngine';
import { useLab } from '../lib/store';
import { GraphCanvas } from './GraphCanvas';
import { EvalPanel } from './EvalBar';
import { Inspector } from './Inspector';
import { Console, MoveList } from './RunPanel';
import { Tabs, useToast } from './ui';
import { useT } from './Level';

type Pane = 'brief' | 'eval' | 'edit' | 'run' | 'moves';
/** The desktop right column shows one of these at a time. */
type SidePane = 'eval' | 'edit' | 'moves';

export interface WorkbenchProps {
  /** Rendered above the graph on every breakpoint. */
  header: React.ReactNode;
  /** Rendered in the left column on desktop, and in its own pane on mobile. */
  brief?: React.ReactNode;
  /**
   * Names the brief's own mobile tab and makes it the pane people land on.
   * A build task passes "Build" so the checklist is the first thing on screen
   * instead of being buried behind a score people have not met yet.
   */
  briefLabel?: string;
  onPositionChange?: (position: Position) => void;
  onHint?: () => void;
  hintsUsed?: number;
}

export function Workbench({ header, brief, briefLabel, onPositionChange, onHint, hintsUsed = 0 }: WorkbenchProps) {
  const graph = useLab(s => s.graph);
  const mocks = useLab(s => s.mocks);
  const puzzle = useLab(s => s.puzzle);
  const ledger = useLab(s => s.ledger);
  const redoStack = useLab(s => s.redoStack);
  const selection = useLab(s => s.selection);
  const reviewIndex = useLab(s => s.reviewIndex);
  const dispatch = useLab(s => s.dispatch);
  const select = useLab(s => s.select);
  const review = useLab(s => s.review);
  const undo = useLab(s => s.undo);
  const redo = useLab(s => s.redo);
  const reset = useLab(s => s.reset);
  const initial = useLab(s => s.initial);

  const toast = useToast();
  const t = useT();
  const [pane, setPane] = useState<Pane>(briefLabel ? 'brief' : 'edit');
  const [side, setSide] = useState<SidePane>('eval');
  const [playhead, setPlayhead] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  const { position, line, thinking, runSearch, requestHint, setLine } = useEngine(graph, mocks, puzzle?.criteria);

  const viewGraph = reviewIndex === null ? graph : reviewIndex < 0 ? initial : ledger[reviewIndex]?.snapshot ?? graph;
  const readOnly = reviewIndex !== null;

  useEffect(() => {
    onPositionChange?.(position);
  }, [position, onPositionChange]);

  // Reset the scrubber whenever the position changes.
  useEffect(() => {
    setPlayhead(0);
    setRunning(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, [position.sim]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  const run = useCallback(() => {
    const steps = position.sim.steps.length;
    if (!steps) {
      toast('Nothing to run — this graph has no entry point.', 'err');
      return;
    }
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPlayhead(0);
    setRunning(true);
    setPane('run');
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i += 1;
      if (i >= steps) {
        setPlayhead(steps - 1);
        setRunning(false);
        if (timerRef.current) window.clearInterval(timerRef.current);
        return;
      }
      setPlayhead(i);
    }, Math.max(90, Math.min(320, 1800 / steps)));
  }, [position.sim.steps.length, toast]);

  const activeNode = running || playhead > 0 ? position.sim.steps[playhead]?.nodeId ?? null : null;
  const visited = useMemo(
    () => (playhead > 0 || running ? position.sim.steps.slice(0, playhead + 1).map(s => s.nodeId) : []),
    [position.sim.steps, playhead, running]
  );

  const play = (move: Move) => {
    if (readOnly) {
      toast('You are reviewing an earlier position. Return to live to edit.', 'info');
      return;
    }
    const ok = dispatch(move);
    if (!ok && puzzle) toast(`Move limit reached — you have ${puzzle.maxMoves} moves for this tactic.`, 'err');
  };

  const addNode = (kind: NodeKind) => {
    const xs = graph.nodes.map(n => n.x);
    play({ type: 'ADD_NODE', kind, x: (xs.length ? Math.max(...xs) : 100) + 220, y: 150 + Math.random() * 120 });
    toast(`${KIND_META[kind].label} added — tap its ⊕ handle to wire it in.`, 'info');
  };

  const askHint = async () => {
    // In a tactic the authored hint is the better teacher, so the caller owns it.
    if (onHint) {
      onHint();
      return;
    }
    const hint = await requestHint();
    if (hint?.description) toast(`Engine suggests: ${hint.description}`, 'info');
    else toast('The engine finds no improving move — this position already looks sound.', 'ok');
  };

  const showLine = async () => {
    const found = await runSearch(2);
    if (found && found.moves.length) {
      toast(`Best line found: ${found.descriptions.join(' → ')} (eval ${found.value >= 0 ? '+' : ''}${found.value.toFixed(1)})`, 'ok');
    } else {
      toast('No improving line — the engine agrees with your position.', 'ok');
    }
  };

  const evalPane = (
    <EvalPanel
      position={position}
      thinking={thinking}
      onFocus={id => id && select({ type: 'node', id })}
      header={
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button className="btn-ghost !px-2.5 !py-1.5 !text-[11px]" onClick={askHint} disabled={thinking}>
            <Lightbulb size={12} /> {t('hint')}{hintsUsed > 0 ? ` (${hintsUsed})` : ''}
          </button>
          <button className="btn-ghost !px-2.5 !py-1.5 !text-[11px]" onClick={showLine} disabled={thinking}>
            <Cpu size={12} /> {thinking ? 'Thinking…' : t('bestLine')}
          </button>
          {line && line.descriptions.length > 0 && (
            <button className="btn-quiet !px-2 !py-1.5 !text-[11px]" onClick={() => setLine(null)}>
              clear
            </button>
          )}
        </div>
      }
    />
  );

  const editPane = (
    <Inspector
      graph={viewGraph}
      selection={selection}
      onMove={play}
      onAddNode={addNode}
      onDeleteNode={id => play({ type: 'REMOVE_NODE', nodeId: id })}
      onDeleteEdge={id => play({ type: 'REMOVE_EDGE', edgeId: id })}
      readOnly={readOnly}
    />
  );

  const runPane = <Console sim={position.sim} playhead={playhead} onSeek={setPlayhead} onRun={run} running={running} />;

  const movesPane = (
    <MoveList
      ledger={ledger}
      reviewIndex={reviewIndex}
      onReview={review}
      onUndo={undo}
      onRedo={redo}
      onReset={reset}
      canRedo={redoStack.length > 0}
      maxMoves={puzzle?.maxMoves}
    />
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen">
      {header}

      {line && line.descriptions.length > 0 && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-brand/10 border border-brand/30 flex items-start gap-2 animate-popIn">
          <Cpu size={14} className="text-brand-bright mt-0.5 shrink-0" />
          <div className="text-[12px] leading-snug text-chalk min-w-0">
            <span className="font-bold text-brand-bright">Engine line </span>
            <span className="font-mono">
              {line.value >= 0 ? '+' : ''}
              {line.value.toFixed(1)}
            </span>
            <span className="text-chalk-dim"> · {line.descriptions.join(' → ')}</span>
          </div>
        </div>
      )}

      {/* The brief column appears from lg, not xl: on a 1024–1279px laptop the
          build checklist was being hidden entirely, which is the one thing on
          this screen nobody can afford to lose. */}
      <div
        className={`grow min-h-0 grid grid-rows-[auto_1fr] lg:grid-rows-1 gap-2 px-2 pb-2 ${
          brief
            ? 'lg:grid-cols-[250px_minmax(0,1fr)_300px] xl:grid-cols-[280px_minmax(0,1fr)_340px]'
            : 'lg:grid-cols-[minmax(0,1fr)_340px]'
        }`}
      >
        {/* The left column is now only the brief. The move history used to sit
            under it in a fixed-height box that could shrink while its content
            could not, so the pattern notes and "No moves yet" drew over each
            other. It lives in the right column's tabs instead, which also
            takes this screen from six panels down to four. */}
        {brief && (
          <aside className="hidden lg:flex flex-col panel overflow-hidden min-h-0">
            <div className="overflow-y-auto grow min-h-0">{brief}</div>
          </aside>
        )}

        <section className="flex flex-col gap-2 min-h-0">
          <div className="grow min-h-[220px] lg:min-h-0">
            <GraphCanvas
              graph={viewGraph}
              issues={position.report.issues}
              selection={selection}
              onSelect={select}
              onMoveNode={(id, x, y) => !readOnly && dispatch({ type: 'MOVE_NODE', nodeId: id, x, y })}
              onConnect={(source, target) => {
                const from = viewGraph.nodes.find(n => n.id === source);
                const to = viewGraph.nodes.find(n => n.id === target);
                if (!from || !to) return;
                play({ type: 'CONNECT_EDGE', source, target, condition: defaultCondition(from.kind, to.kind) });
              }}
              activeNodeId={activeNode}
              visited={visited}
              readOnly={readOnly}
            />
          </div>
          <div className="hidden lg:block h-52 panel overflow-hidden shrink-0">{runPane}</div>
        </section>

        {/* One pane at a time, not two stacked at a fixed ratio.
            The old 52/48 split had no overflow guard, so on a short viewport
            the health panel's header spilled straight over the editor's
            headings — and even when it fitted, six panels at once is the
            thing people were calling complicated. */}
        <aside className="hidden lg:flex flex-col panel overflow-hidden min-h-0">
          <div className="p-2 border-b border-ink-700 shrink-0">
            <Tabs<SidePane>
              active={side}
              onChange={setSide}
              className="!bg-transparent !border-0 !p-0"
              tabs={[
                { id: 'eval', label: t('score') },
                { id: 'edit', label: 'Edit' },
                { id: 'moves', label: `${t('moves')} ${ledger.filter(e => e.scoring).length}` },
              ]}
            />
          </div>
          <div className="grow min-h-0 overflow-hidden flex flex-col">
            {side === 'eval' && evalPane}
            {side === 'edit' && <div className="overflow-y-auto grow min-h-0">{editPane}</div>}
            {side === 'moves' && movesPane}
          </div>
        </aside>

        {/* Mobile pane switcher.
            The tab strip is shrink-0 and the panel's floor is a pixel value,
            not a vh: a 34vh minimum asked for more height than the row had, so
            flex took it out of the tabs instead and squashed the strip to 9px
            — the controls were there but invisible. */}
        <div className="lg:hidden flex flex-col min-h-0 gap-2">
          <Tabs<Pane>
            className="shrink-0"
            active={pane}
            onChange={setPane}
            tabs={[
              ...(briefLabel ? [{ id: 'brief' as Pane, label: briefLabel }] : []),
              // No score in the label: it is the biggest thing inside that pane
              // already, and repeating it pushed the fifth tab off a phone.
              { id: 'eval', label: t('score') },
              { id: 'edit', label: 'Edit' },
              { id: 'run', label: t('run') },
              { id: 'moves', label: `${t('moves')} ${ledger.filter(e => e.scoring).length}` },
            ]}
          />
          <div className="panel grow min-h-[180px] overflow-hidden flex flex-col">
            {pane === 'brief' && <div className="overflow-y-auto grow min-h-0">{brief}</div>}
            {pane === 'eval' && (
              <div className="overflow-y-auto grow min-h-0">
                {brief && !briefLabel && <div className="border-b border-ink-700">{brief}</div>}
                <div className="min-h-[40vh] flex flex-col">{evalPane}</div>
              </div>
            )}
            {pane === 'edit' && <div className="overflow-y-auto grow min-h-0">{editPane}</div>}
            {pane === 'run' && runPane}
            {pane === 'moves' && movesPane}
          </div>
        </div>
      </div>
    </div>
  );
}
