import { useEffect, useRef } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Play, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { SimResult, TraceStep } from '../lib/simulator';
import { LedgerEntry } from '../lib/store';
import { Chip, Empty } from './ui';

const CHANNEL: Record<TraceStep['channel'], string> = {
  sys: 'text-chalk-faint',
  agent: 'text-brand-bright',
  tool: 'text-eval-info',
  guard: 'text-[#B57BFF]',
  warn: 'text-eval-warn',
  err: 'text-eval-down',
  ok: 'text-eval-up',
};

const STATUS_COPY: Record<SimResult['status'], { text: string; tone: 'up' | 'down' | 'warn' }> = {
  terminated: { text: 'Run halted cleanly', tone: 'up' },
  infinite_cycle: { text: 'Infinite cycle — the loop never converged', tone: 'down' },
  stuck: { text: 'Stalled — no outgoing condition could fire', tone: 'down' },
  token_limit: { text: 'Token budget exceeded with no budget route', tone: 'down' },
  unsafe_exit: { text: 'Terminated, but an untrusted instruction reached the output', tone: 'down' },
  empty: { text: 'Nothing to run — the graph has no entry point', tone: 'warn' },
};

export function Console({
  sim,
  playhead,
  onSeek,
  onRun,
  running,
}: {
  sim: SimResult;
  playhead: number;
  onSeek: (i: number) => void;
  onRun: () => void;
  running: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const visible = sim.steps.slice(0, playhead + 1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [playhead]);

  const status = STATUS_COPY[sim.status];
  const finished = playhead >= sim.steps.length - 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-700">
        <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={onRun} disabled={running}>
          <Play size={13} /> {running ? 'Running…' : 'Run'}
        </button>
        <div className="flex items-center gap-0.5 ml-auto">
          <StepBtn onClick={() => onSeek(0)} disabled={playhead <= 0} label="First step">
            <ChevronFirst size={15} />
          </StepBtn>
          <StepBtn onClick={() => onSeek(playhead - 1)} disabled={playhead <= 0} label="Previous step">
            <ChevronLeft size={15} />
          </StepBtn>
          <span className="font-mono text-[11px] text-chalk-dim px-1.5 tabular-nums">
            {sim.steps.length ? playhead + 1 : 0}/{sim.steps.length}
          </span>
          <StepBtn onClick={() => onSeek(playhead + 1)} disabled={finished} label="Next step">
            <ChevronRight size={15} />
          </StepBtn>
          <StepBtn onClick={() => onSeek(sim.steps.length - 1)} disabled={finished} label="Last step">
            <ChevronLast size={15} />
          </StepBtn>
        </div>
      </div>

      <div className="grow overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed min-h-0 bg-ink-900/40">
        {visible.length === 0 && <div className="text-chalk-faint py-4">Press Run to execute the graph against the mocked tools.</div>}
        {visible.map(step => (
          <button
            key={step.index}
            onClick={() => onSeek(step.index)}
            className={`w-full text-left flex gap-2 py-0.5 rounded hover:bg-ink-800/70 ${
              step.index === playhead ? 'bg-ink-800' : ''
            }`}
          >
            <span className="text-chalk-faint tabular-nums shrink-0 w-6">{String(step.index + 1).padStart(2, '0')}</span>
            <span className={`${CHANNEL[step.channel]} break-words`}>{step.line}</span>
          </button>
        ))}
        {finished && sim.steps.length > 0 && (
          <div className="mt-2 pt-2 border-t border-ink-700 flex flex-wrap items-center gap-2">
            <Chip tone={status.tone}>{status.text}</Chip>
            <Chip>{sim.tokens} tokens</Chip>
            {sim.output && <Chip tone="info">{sim.output.length > 46 ? `${sim.output.slice(0, 46)}…` : sim.output}</Chip>}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {sim.steps.length > 0 && (
        <input
          type="range"
          min={0}
          max={Math.max(0, sim.steps.length - 1)}
          value={playhead}
          onChange={e => onSeek(Number(e.target.value))}
          aria-label="Execution step"
          className="w-full accent-[#EE1B24] bg-ink-850 h-1.5 cursor-pointer"
        />
      )}
    </div>
  );
}

function StepBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-7 h-7 grid place-items-center rounded-md text-chalk-dim hover:text-chalk hover:bg-ink-750 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function MoveList({
  ledger,
  reviewIndex,
  onReview,
  onUndo,
  onRedo,
  onReset,
  canRedo,
  maxMoves,
}: {
  ledger: LedgerEntry[];
  reviewIndex: number | null;
  onReview: (i: number | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  canRedo: boolean;
  maxMoves?: number;
}) {
  const scoring = ledger.filter(e => e.scoring).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-ink-700">
        <span className="label">Moves</span>
        {maxMoves != null && (
          <Chip tone={scoring >= maxMoves ? 'down' : 'brand'}>
            {scoring}/{maxMoves}
          </Chip>
        )}
        <div className="ml-auto flex gap-0.5">
          <StepBtn onClick={onUndo} disabled={!ledger.length} label="Undo">
            <Undo2 size={15} />
          </StepBtn>
          <StepBtn onClick={onRedo} disabled={!canRedo} label="Redo">
            <Redo2 size={15} />
          </StepBtn>
          <StepBtn onClick={onReset} disabled={!ledger.length} label="Reset position">
            <RotateCcw size={15} />
          </StepBtn>
        </div>
      </div>

      <div className="grow overflow-y-auto min-h-0 p-1.5">
        {ledger.length === 0 ? (
          <Empty title="No moves yet" hint="Every edit is recorded as a reversible move, exactly like a game score sheet." />
        ) : (
          <>
            <button
              onClick={() => onReview(-1)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12px] font-mono ${
                reviewIndex === -1 ? 'bg-brand text-white' : 'text-chalk-faint hover:bg-ink-750'
              }`}
            >
              start position
            </button>
            {ledger.map((entry, i) => (
              <button
                key={i}
                onClick={() => onReview(reviewIndex === i ? null : i)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-baseline gap-2 ${
                  reviewIndex === i ? 'bg-brand text-white' : 'hover:bg-ink-750'
                }`}
              >
                <span className="font-mono text-[11px] tabular-nums opacity-60 shrink-0">{i + 1}.</span>
                <span className="text-[12px] font-medium truncate">{entry.description}</span>
                {!entry.scoring && <span className="ml-auto text-[9px] uppercase opacity-50 shrink-0">free</span>}
              </button>
            ))}
          </>
        )}
      </div>

      {reviewIndex !== null && (
        <button className="btn-ghost m-2 !text-xs" onClick={() => onReview(null)}>
          Return to live position
        </button>
      )}
    </div>
  );
}
