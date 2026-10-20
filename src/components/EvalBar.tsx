import { AlertTriangle, CheckCircle2, Info, ShieldCheck, XCircle } from 'lucide-react';
import { EvalReport, Issue } from '../lib/analyzer';
import { Position } from '../lib/engine';
import { Chip } from './ui';
import { Explain, T, useT } from './Level';
import { useLevel } from '../lib/level';

/** Simulator status -> glossary key, so outcomes read in the user's vocabulary. */
export const STATUS_TERM: Record<string, string> = {
  terminated: 'outTerminated',
  infinite_cycle: 'outInfinite',
  stuck: 'outStuck',
  token_limit: 'outBudget',
  unsafe_exit: 'outUnsafe',
  empty: 'outEmpty',
};

const SEV_ICON = {
  critical: <XCircle size={14} className="text-eval-down shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={14} className="text-eval-warn shrink-0 mt-0.5" />,
  info: <Info size={14} className="text-eval-info shrink-0 mt-0.5" />,
  good: <CheckCircle2 size={14} className="text-eval-up shrink-0 mt-0.5" />,
};

/** Vertical Stockfish-style bar: white advantage on top, entropy below. */
export function EvalBar({ score, compact }: { score: number; compact?: boolean }) {
  const pct = ((score + 9.9) / 19.8) * 100;
  const positive = score >= 0;
  return (
    <div className={`relative ${compact ? 'w-2.5' : 'w-4'} rounded-full bg-ink-900 border border-ink-700 overflow-hidden shrink-0`}>
      <div
        className="absolute bottom-0 left-0 right-0 transition-[height] duration-500 ease-out"
        style={{ height: `${Math.max(2, Math.min(98, pct))}%`, background: positive ? '#3FD07A' : '#FF5A5F' }}
      />
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/25" />
    </div>
  );
}

export function ScoreReadout({ score, thinking }: { score: number; thinking?: boolean }) {
  const positive = score >= 0;
  const t = useT();
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`font-mono font-extrabold tabular-nums leading-none ${positive ? 'text-eval-up' : 'text-eval-down'} ${
          thinking ? 'opacity-60' : ''
        }`}
        style={{ fontSize: 30 }}
      >
        {positive ? '+' : ''}
        {score.toFixed(1)}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-chalk-faint">{t('score')}</span>
    </div>
  );
}

export function IssueRow({ issue, onFocus }: { issue: Issue; onFocus?: (nodeId?: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onFocus?.(issue.nodeId)}
      className="w-full text-left flex gap-2 px-3 py-2 rounded-lg hover:bg-ink-750 transition group"
    >
      {SEV_ICON[issue.severity]}
      <span className="min-w-0">
        <span className="block text-[12.5px] leading-snug text-chalk">{issue.message}</span>
        {issue.fix && issue.severity !== 'good' && (
          <span className="block mt-1 text-[11.5px] leading-snug text-chalk-faint group-hover:text-chalk-dim">
            Fix · {issue.fix}
          </span>
        )}
      </span>
    </button>
  );
}

export function EvalPanel({
  position,
  thinking,
  onFocus,
  header,
}: {
  position: Position;
  thinking?: boolean;
  onFocus?: (nodeId?: string) => void;
  header?: React.ReactNode;
}) {
  const t = useT();
  const level = useLevel(s => s.level);
  const report: EvalReport = position.report;
  const problems = report.issues.filter(i => i.severity !== 'good');
  const wins = report.issues.filter(i => i.severity === 'good');
  const overBudget = report.metrics.estimatedTokens > report.metrics.budget;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-4 pb-3 border-b border-ink-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="label mb-1 flex items-center">
              <T k="scorePanel" />
              <Explain label={t('scoreLong')}>{t('scoreHelp')}</Explain>
            </div>
            <ScoreReadout score={report.score} thinking={thinking} />
          </div>
          <EvalBar score={report.score} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Stat label={t('budget')} value={`${report.metrics.estimatedTokens}`} sub={`/ ${report.metrics.budget}`} tone={overBudget ? 'down' : 'up'} />
          <Stat label={level === 'beginner' ? 'Setup' : 'ITOLS'} value={`${Math.round(report.metrics.itolsCoverage * 100)}%`} tone={report.metrics.itolsCoverage > 0.8 ? 'up' : 'warn'} />
          <Stat
            label={t('run')}
            value={t(STATUS_TERM[position.sim.status] ?? 'outStuck')}
            tone={position.sim.status === 'terminated' ? 'up' : 'down'}
            prose
          />
        </div>
        {header}
      </div>

      <div className="overflow-y-auto grow p-1.5 min-h-0">
        {problems.length === 0 && (
          <div className="px-3 py-6 text-center">
            <ShieldCheck size={22} className="mx-auto text-eval-up mb-2" />
            <p className="text-sm font-semibold text-chalk">Nothing is broken</p>
            <p className="text-xs text-chalk-dim mt-1">
              {level === 'beginner'
                ? 'The diagram holds together, the checklist is filled in, and a test run finishes properly.'
                : 'Static analysis, ITOLS compliance and the simulated run all pass.'}
            </p>
          </div>
        )}
        {problems.map((issue, i) => (
          <IssueRow key={`${issue.code}-${i}`} issue={issue} onFocus={onFocus} />
        ))}
        {wins.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-1 label">Working well</div>
            {wins.map((issue, i) => (
              <IssueRow key={`good-${i}`} issue={issue} onFocus={onFocus} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * `prose` is for values that are a phrase rather than a number. At beginner
 * level the run status reads "It costs too much", which a single truncated
 * mono line turned into "It costs to…" — so those wrap to two lines in the
 * body face instead. The fixed min-height keeps the three tiles aligned
 * whether or not one of them wraps.
 */
function Stat({
  label,
  value,
  sub,
  tone,
  prose,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'up' | 'down' | 'warn';
  prose?: boolean;
}) {
  const colours = { up: 'text-eval-up', down: 'text-eval-down', warn: 'text-eval-warn' };
  return (
    <div className="panel-flat px-2 py-1.5 min-h-[46px] flex flex-col justify-center">
      <div className="text-[9px] font-bold uppercase tracking-wider text-chalk-faint">{label}</div>
      <div
        className={`font-bold ${colours[tone]} ${
          prose ? 'text-[11.5px] leading-tight truncate-2' : 'text-[13px] font-mono truncate'
        }`}
        title={prose ? `${value}${sub ? ` ${sub}` : ''}` : undefined}
      >
        {value}
        {sub && <span className="text-chalk-faint font-normal"> {sub}</span>}
      </div>
    </div>
  );
}

export function GradeChip({ grade }: { grade: string }) {
  const tone =
    grade === 'brilliant' || grade === 'best' ? 'up' : grade === 'good' ? 'info' : grade === 'inaccuracy' ? 'warn' : 'down';
  return <Chip tone={tone as 'up' | 'info' | 'warn' | 'down'}>{grade}</Chip>;
}
