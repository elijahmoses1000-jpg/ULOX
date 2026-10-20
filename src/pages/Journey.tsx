import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Flame, HelpCircle, Lock, Play, Sparkles } from 'lucide-react';
import { STAGES, journeyProgress, nextStep, readBuilt } from '../lib/journey';
import { levelFor, useProfile } from '../lib/profile';
import { useLevel } from '../lib/level';
import { Card, Chip, Logo, Progress, Ring } from '../components/ui';

/**
 * Home is the journey. A returning learner sees one sentence and one button;
 * the ladder underneath is there to show them how far they have come, not to
 * make them choose.
 */
export function Journey() {
  const navigate = useNavigate();
  const profile = useProfile(s => s.profile);
  const push = useProfile(s => s.push);
  const replay = useLevel(s => s.replayOnboarding);

  const [built, setBuilt] = useState(readBuilt);
  useEffect(() => {
    setBuilt(readBuilt());
    void push();
  }, [push]);

  const progress = useMemo(() => journeyProgress(profile, built), [profile, built]);
  const next = useMemo(() => nextStep(profile, built), [profile, built]);
  const xp = levelFor(profile.xp);

  const doneStages = progress.filter(p => p.complete).length;
  const overall = progress.reduce((sum, p) => sum + p.ratio, 0) / STAGES.length;
  const isNew = profile.xp === 0 && Object.keys(profile.solved).length === 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 lg:py-8 space-y-5">
      <div className="lg:hidden">
        <Logo size={24} />
      </div>

      {/* The one thing to do next. Nothing competes with this. */}
      <section className="relative overflow-hidden rounded-2xl border p-5 lg:p-7 accent-glow" style={{ borderColor: `${next.stage.hex}55` }}>
        <div
          className="absolute -right-24 -top-28 w-80 h-80 rounded-full blur-3xl opacity-20"
          style={{ background: next.stage.hex }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: next.stage.hex }}>
            {isNew ? 'Start here' : next.kind === 'done' ? 'Journey complete' : 'Your next step'}
          </p>
          <h1 className="font-display text-2xl lg:text-[34px] font-bold tracking-tight leading-[1.15] mt-1.5">
            {next.label}
          </h1>
          <p className="mt-2 text-[13px] text-chalk-dim">{next.because}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              className="btn-primary !px-4 !py-2.5"
              onClick={() => navigate(next.to)}
              style={{ background: next.stage.hex, color: '#0E0F11' }}
            >
              {next.kind === 'read' ? <Sparkles size={15} /> : <Play size={15} />}
              {next.action}
            </button>
            <Link to={`/journey/${next.stage.id}`} className="btn-ghost !text-xs">
              See the whole step
            </Link>
          </div>
        </div>
      </section>

      {/* The ladder. Six rungs, in order, with the reason each one is here. */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display text-[17px] font-bold">The six disciplines</h2>
            <p className="text-[12.5px] text-chalk-dim mt-0.5">
              Each one builds on the last. You can jump around, but this order is why it makes sense.
            </p>
          </div>
          <span className="text-[12px] font-mono font-bold text-chalk-dim shrink-0">
            {doneStages}/{STAGES.length}
          </span>
        </div>

        <div className="mb-4">
          <Progress value={overall} tone={overall === 1 ? 'up' : 'brand'} />
        </div>

        <ol className="space-y-2">
          {progress.map((p, i) => {
            const prevComplete = i === 0 || progress[i - 1].complete;
            const isCurrent = p.stage.id === next.stage.id && next.kind !== 'done';
            return (
              <li key={p.stage.id}>
                <Link to={`/journey/${p.stage.id}`}>
                  <Card
                    className={`p-4 transition group hover:border-ink-500 ${isCurrent ? 'accent-glow' : ''}`}
                    style={isCurrent ? { borderColor: `${p.stage.hex}66` } : undefined}
                  >
                    <div className="flex items-start gap-3.5">
                      <span
                        className="w-10 h-10 rounded-xl grid place-items-center shrink-0 font-display font-bold text-[15px]"
                        style={{
                          background: p.complete ? p.stage.hex : `${p.stage.hex}1F`,
                          color: p.complete ? '#0E0F11' : p.stage.hex,
                        }}
                      >
                        {p.complete ? <Check size={18} /> : p.stage.n}
                      </span>

                      <div className="grow min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-[15.5px] font-bold group-hover:text-chalk transition">
                            {p.stage.title}
                          </h3>
                          <span className="text-[11px] font-semibold" style={{ color: p.stage.hex }}>
                            {p.stage.formal}
                          </span>
                          {isCurrent && <Chip tone="brand">you are here</Chip>}
                          {!prevComplete && !p.complete && !isCurrent && (
                            <span className="text-chalk-faint" title="Earlier steps are not finished — you can still open this">
                              <Lock size={12} />
                            </span>
                          )}
                        </div>
                        <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug">{p.stage.promise}</p>

                        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-chalk-faint">
                          <span>
                            {p.topicsDone}/{p.topicsTotal} read
                          </span>
                          <span>
                            {p.drillsDone}/{p.drillsTotal} fixed
                          </span>
                          <span>{p.built ? 'built' : 'not built'}</span>
                        </div>
                        <div className="mt-1.5">
                          <Progress value={p.ratio} tone={p.complete ? 'up' : 'brand'} />
                        </div>
                      </div>

                      <ArrowRight
                        size={16}
                        className="text-chalk-faint group-hover:text-chalk mt-1 shrink-0 group-hover:translate-x-0.5 transition"
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <Card className="p-4">
        <div className="flex items-center gap-4">
          <Ring value={xp.into / xp.span} size={46} label={`L${xp.level}`} />
          <div className="grow min-w-0">
            <div className="flex items-center gap-3 text-[12.5px] text-chalk-dim flex-wrap">
              <span>
                <span className="font-mono font-bold text-chalk">{profile.rating.rating}</span> rating
              </span>
              <span className="flex items-center gap-1">
                <Flame size={12} className="text-eval-warn" />
                {profile.streak} day streak
              </span>
              <span>{Object.keys(profile.solved).length} fixed</span>
            </div>
            <div className="mt-2">
              <Progress value={xp.into / xp.span} />
            </div>
          </div>
          <button className="btn-quiet !text-[11px] shrink-0" onClick={replay}>
            <HelpCircle size={13} /> What is UloX?
          </button>
        </div>
      </Card>
    </div>
  );
}
