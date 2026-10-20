import { useEffect, useRef, useState } from 'react';
import { Check, HelpCircle, Sparkles } from 'lucide-react';
import { LEVELS, LEVEL_ORDER, Level, useLevel } from '../lib/level';

/** Renders a term in the reader's vocabulary. */
export function T({ k }: { k: string }) {
  const t = useLevel(s => s.t);
  return <>{t(k)}</>;
}

export function useT() {
  return useLevel(s => s.t);
}

/**
 * Show children only at certain levels. `from` is inclusive and is the common
 * case: detail that would overwhelm a beginner but that an expert expects.
 */
export function ShowAt({
  from,
  only,
  children,
}: {
  from?: Level;
  only?: Level;
  children: React.ReactNode;
}) {
  const level = useLevel(s => s.level);
  if (only) return only === level ? <>{children}</> : null;
  if (from) {
    return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(from) ? <>{children}</> : null;
  }
  return <>{children}</>;
}

/**
 * A definition attached to the thing it defines. Comprehension dies when the
 * explanation lives on another page, so this keeps it one tap away and never
 * takes over the screen.
 */
export function Explain({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <span className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        className="ml-1 text-chalk-faint hover:text-accent transition rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-40 top-full left-0 mt-1.5 w-64 p-3 rounded-xl bg-ink-800 border border-ink-600
                     shadow-pop text-[12px] leading-relaxed text-chalk-dim font-normal normal-case tracking-normal animate-popIn"
        >
          <span className="block font-bold text-chalk mb-1">{label}</span>
          {children}
        </span>
      )}
    </span>
  );
}

/** The signature control: switching it visibly re-tints and re-words the app. */
export function LevelSwitcher({ compact = false }: { compact?: boolean }) {
  const level = useLevel(s => s.level);
  const setLevel = useLevel(s => s.setLevel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (compact) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold accent-rim"
          style={{ color: LEVELS[level].hex }}
          aria-label={`Skill level: ${LEVELS[level].label}. Change it.`}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: LEVELS[level].hex }} />
          {LEVELS[level].label}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 w-72 panel shadow-pop p-2 animate-popIn">
            <LevelOptions
              level={level}
              onPick={l => {
                setLevel(l);
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return <LevelOptions level={level} onPick={setLevel} />;
}

function LevelOptions({ level, onPick }: { level: Level; onPick: (l: Level) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-chalk-faint">
        How should UloX talk to you?
      </p>
      {LEVEL_ORDER.map(id => {
        const meta = LEVELS[id];
        const active = id === level;
        return (
          <button
            key={id}
            onClick={() => onPick(id)}
            className={`w-full text-left p-3 rounded-xl border transition ${
              active ? 'bg-ink-750' : 'bg-ink-850 border-ink-700 hover:border-ink-500'
            }`}
            style={active ? { borderColor: meta.hex } : undefined}
          >
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.hex }} />
              <span className="text-[13.5px] font-bold" style={{ color: active ? meta.hex : undefined }}>
                {meta.label}
              </span>
              {active && <Check size={14} className="ml-auto" style={{ color: meta.hex }} />}
            </span>
            <span className="block text-[11.5px] text-chalk-dim mt-1 leading-snug">{meta.who}</span>
            {active && (
              <ul className="mt-2 space-y-0.5">
                {meta.changes.map(c => (
                  <li key={c} className="flex items-start gap-1.5 text-[11px] text-chalk-faint">
                    <Sparkles size={10} className="mt-[3px] shrink-0" style={{ color: meta.hex }} />
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </button>
        );
      })}
    </div>
  );
}
