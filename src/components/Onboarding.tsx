import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Map, Swords, Target } from 'lucide-react';
import { LEVELS, LEVEL_ORDER, Level, useLevel } from '../lib/level';
import { Logo } from './ui';

/**
 * First run. Three screens, in the order a confused person needs them:
 * what is this, who am I, what do I do now. The middle screen is the level
 * pick, so the rest of the app is already speaking their language by the time
 * they land on it.
 */
export function Onboarding() {
  const navigate = useNavigate();
  const onboarded = useLevel(s => s.onboarded);
  const finish = useLevel(s => s.finishOnboarding);
  const level = useLevel(s => s.level);
  const setLevel = useLevel(s => s.setLevel);
  const [step, setStep] = useState(0);

  if (onboarded) return null;

  const start = (to: string) => {
    finish();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-ink-900/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-2xl panel accent-glow rounded-2xl overflow-hidden animate-popIn">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-ink-700">
            <Logo size={22} />
            <span className="ml-auto flex items-center gap-1.5" aria-label={`Step ${step + 1} of 3`}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: i === step ? 22 : 8,
                    background: i <= step ? LEVELS[level].hex : '#333639',
                  }}
                />
              ))}
            </span>
          </div>

          <div className="p-5 sm:p-7">
            {step === 0 && <WhatIsThis />}
            {step === 1 && <PickLevel level={level} onPick={setLevel} />}
            {step === 2 && <FirstMove onStart={start} />}
          </div>

          <div className="flex items-center gap-2 px-5 py-4 border-t border-ink-700">
            <button className="btn-quiet !text-xs" onClick={finish}>
              Skip
            </button>
            <div className="ml-auto flex gap-2">
              {step > 0 && (
                <button className="btn-ghost !text-xs" onClick={() => setStep(s => s - 1)}>
                  Back
                </button>
              )}
              {step < 2 && (
                <button className="btn-primary !text-xs" onClick={() => setStep(s => s + 1)}>
                  {step === 0 ? 'Makes sense' : 'Next'} <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatIsThis() {
  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
        UloX is chess practice for <span className="text-brand">AI systems</span>.
      </h1>
      <p className="mt-2.5 text-[14px] leading-relaxed text-chalk-dim">
        An AI agent is a loop: it thinks, it uses a tool, it looks at the result, it decides again. Most of them break
        in the same handful of ways — they never stop, they ignore an error, they follow instructions hidden in a
        document.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-chalk-dim">
        Here you get a broken one and fix it. Same as a chess puzzle: a position, a small number of moves, one right
        answer.
      </p>

      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        <BeforeAfter
          tone="#FF5A5F"
          caption="Loops forever — nothing tells it to stop"
          arrowLabel="always"
          closed
        />
        <BeforeAfter tone="#3FD07A" caption="Stops once it has what it needs" arrowLabel="has enough" closed={false} />
      </div>

      <p className="mt-4 text-[12.5px] text-chalk-faint leading-relaxed">
        That one change is a whole puzzle. Get it right and your score goes up.
      </p>
    </div>
  );
}

/** A four-node loop, drawn open or closed, so the fix is visible before it is explained. */
function BeforeAfter({
  tone,
  caption,
  arrowLabel,
  closed,
}: {
  tone: string;
  caption: string;
  arrowLabel: string;
  closed: boolean;
}) {
  return (
    <figure className="panel-flat p-3">
      <svg viewBox="0 0 220 108" className="w-full" role="img" aria-label={caption}>
        <rect x="8" y="34" width="66" height="30" rx="7" fill="#2A1C1D" stroke="#EE1B24" strokeWidth="1.3" />
        <text x="41" y="53" textAnchor="middle" fontSize="10" fontWeight="700" fill="#E9EBEE">
          Thinks
        </text>
        <rect x="112" y="8" width="62" height="28" rx="7" fill="#1B2530" stroke="#4EA8FF" strokeWidth="1.3" />
        <text x="143" y="26" textAnchor="middle" fontSize="10" fontWeight="700" fill="#E9EBEE">
          Searches
        </text>
        <path d="M74 44 C 95 40, 100 26, 112 22" fill="none" stroke="#4A4E53" strokeWidth="1.6" />
        <path d="M112 30 C 98 44, 92 50, 74 52" fill="none" stroke={tone} strokeWidth="1.8" strokeDasharray="4 4" />

        {closed ? (
          <>
            <circle cx="150" cy="76" r="16" fill="none" stroke={tone} strokeWidth="1.6" strokeDasharray="3 4" />
            <text x="150" y="80" textAnchor="middle" fontSize="14" fill={tone}>
              ∞
            </text>
          </>
        ) : (
          <>
            <rect x="118" y="62" width="62" height="28" rx="7" fill="#22242A" stroke="#E9EBEE" strokeWidth="1.3" />
            <text x="149" y="80" textAnchor="middle" fontSize="10" fontWeight="700" fill="#E9EBEE">
              Answer
            </text>
            <path d="M74 56 C 96 70, 104 76, 118 76" fill="none" stroke={tone} strokeWidth="1.8" />
          </>
        )}
        <text x="93" y="62" textAnchor="middle" fontSize="8" fontWeight="700" fill={tone}>
          {arrowLabel}
        </text>
      </svg>
      <figcaption className="mt-1.5 text-[11.5px] leading-snug" style={{ color: tone }}>
        {caption}
      </figcaption>
    </figure>
  );
}

function PickLevel({ level, onPick }: { level: Level; onPick: (l: Level) => void }) {
  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">How should we talk to you?</h2>
      <p className="mt-2 text-[13.5px] text-chalk-dim leading-relaxed">
        This changes the words on screen and how much is shown at once. You can switch it any time from the header —
        nothing is locked.
      </p>
      <div className="mt-4 space-y-2">
        {LEVEL_ORDER.map(id => {
          const meta = LEVELS[id];
          const active = id === level;
          return (
            <button
              key={id}
              onClick={() => onPick(id)}
              className={`w-full text-left p-3.5 rounded-xl border-2 transition ${
                active ? 'bg-ink-750' : 'bg-ink-850 border-ink-700 hover:border-ink-500'
              }`}
              style={active ? { borderColor: meta.hex } : undefined}
            >
              <span className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: meta.hex }} />
                <span className="text-[15px] font-bold" style={{ color: active ? meta.hex : undefined }}>
                  {meta.label}
                </span>
              </span>
              <span className="block text-[12.5px] text-chalk-dim mt-1 leading-snug">{meta.who}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FirstMove({ onStart }: { onStart: (to: string) => void }) {
  const options = [
    {
      to: '/',
      icon: Target,
      title: 'Start the journey',
      body: 'Six steps, in order: ask properly, feed it the right things, give it hands, let it loop, route the steps, ship it safely.',
      tag: 'recommended — it tells you the next thing, every time',
    },
    {
      to: '/paths',
      icon: Map,
      title: 'Browse learning paths instead',
      body: 'Ninety-plus roadmaps from roadmap.sh — AI agents, backend, Python, whatever you are here for.',
      tag: 'go at your own pace',
    },
    {
      to: '/arena',
      icon: Swords,
      title: 'Play against someone',
      body: 'Same five positions for both of you. Most right answers wins.',
      tag: 'needs a friend',
    },
  ];

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">Where do you want to start?</h2>
      <p className="mt-2 text-[13.5px] text-chalk-dim">
        If you are not sure, take the journey — it always tells you the one next thing to do.
      </p>
      <div className="mt-4 space-y-2">
        {options.map(o => (
          <button
            key={o.to}
            onClick={() => onStart(o.to)}
            className="w-full text-left p-3.5 rounded-xl bg-ink-850 border border-ink-700 hover:border-accent/60 transition group flex items-start gap-3"
          >
            <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-accent/12 text-accent">
              <o.icon size={18} />
            </span>
            <span className="grow min-w-0">
              <span className="block text-[14.5px] font-bold group-hover:text-accent transition">{o.title}</span>
              <span className="block text-[12.5px] text-chalk-dim mt-0.5 leading-snug">{o.body}</span>
              <span className="block text-[11px] text-chalk-faint mt-1">{o.tag}</span>
            </span>
            <ArrowRight size={16} className="text-chalk-faint group-hover:text-accent mt-1 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
