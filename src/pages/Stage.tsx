import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, ExternalLink, FileText, Hammer, Target, Wrench } from 'lucide-react';
import { STAGES, STAGE_BY_ID, markBuilt, noteTitle, noteUrl, readBuilt, stageProgress } from '../lib/journey';
import { TOPIC_BY_ID, TopicNode } from '../lib/curriculum';
import { PUZZLE_BY_ID } from '../lib/puzzles';
import { useProfile } from '../lib/profile';
import { Card, Chip, Modal, Progress, useToast } from '../components/ui';

/**
 * One discipline, in the order that makes it stick: read the idea, fix a broken
 * one, then build your own. Three sections, nothing else on the page.
 */
export function Stage() {
  const { stageId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const profile = useProfile(s => s.profile);
  const markTopic = useProfile(s => s.markTopic);

  const [built, setBuilt] = useState(readBuilt);
  const [openTopic, setOpenTopic] = useState<TopicNode | null>(null);

  const stage = STAGE_BY_ID.get(stageId as never);

  useEffect(() => {
    const topicId = params.get('topic');
    if (!topicId) return;
    const node = TOPIC_BY_ID.get(topicId);
    if (node) setOpenTopic(node);
  }, [params]);

  const progress = useMemo(
    () => (stage ? stageProgress(stage, profile, built) : null),
    [stage, profile, built]
  );

  if (!stage || !progress) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center">
        <p className="text-chalk-dim">That step does not exist.</p>
        <Link to="/" className="btn-primary mt-4">
          Back to the journey
        </Link>
      </div>
    );
  }

  const nextStage = STAGES.find(s => s.n === stage.n + 1);
  const topics = stage.topics.map(id => TOPIC_BY_ID.get(id)).filter((t): t is TopicNode => !!t);
  const drills = stage.drills.map(id => PUZZLE_BY_ID.get(id)).filter(Boolean);

  const closeTopic = () => {
    setOpenTopic(null);
    if (params.get('topic')) {
      params.delete('topic');
      setParams(params, { replace: true });
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 lg:py-7">
      <Link to="/" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-chalk-dim hover:text-chalk mb-3">
        <ArrowLeft size={14} /> The journey
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-xl grid place-items-center shrink-0 font-display font-bold text-[16px]"
            style={{ background: `${stage.hex}1F`, color: stage.hex }}
          >
            {stage.n}
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: stage.hex }}>
              {stage.formal}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight">{stage.title}</h1>
          </div>
        </div>

        <p className="mt-3 text-[14px] text-chalk leading-relaxed">{stage.promise}</p>
        <p className="mt-2 text-[12.5px] text-chalk-dim leading-relaxed">{stage.why}</p>

        <div className="mt-4 max-w-sm">
          <Progress value={progress.ratio} tone={progress.complete ? 'up' : 'brand'} />
          <p className="mt-1.5 text-[11px] text-chalk-faint">
            {progress.topicsDone}/{progress.topicsTotal} read · {progress.drillsDone}/{progress.drillsTotal} fixed ·{' '}
            {progress.built ? 'built' : 'not built'}
          </p>
        </div>
      </header>

      <Section n={1} icon={BookOpen} title="Read the idea" hint="Short. No code. Tick each one off when it lands.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {topics.map(node => {
            const done = profile.topics[node.id] === 'done';
            return (
              <button
                key={node.id}
                onClick={() => setOpenTopic(node)}
                className={`text-left p-3.5 rounded-xl border transition group ${
                  done ? 'bg-eval-up/8 border-eval-up/40' : 'bg-ink-800 border-ink-700 hover:border-ink-500'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="grow min-w-0">
                    <span className="block text-[13.5px] font-bold text-chalk">{node.title}</span>
                    <span className="block text-[11.5px] text-chalk-dim mt-0.5 leading-snug">{node.blurb}</span>
                  </span>
                  {done && <Check size={15} className="text-eval-up shrink-0 mt-0.5" />}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {stage.notes.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={15} className="text-accent" />
            <h2 className="font-display text-[15px] font-bold">Field notes</h2>
          </div>
          <p className="text-[12px] text-chalk-dim mb-2.5">
            The dense one-page version, if you would rather read it straight through.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {stage.notes.map(id => (
              <a
                key={id}
                href={noteUrl(id)}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-ink-800 border border-ink-700 hover:border-accent/60 transition group"
              >
                <FileText size={14} className="text-chalk-faint shrink-0" />
                <span className="text-[13px] font-semibold text-chalk grow group-hover:text-accent transition">
                  {noteTitle(id)}
                </span>
                <ExternalLink size={12} className="text-chalk-faint shrink-0" />
              </a>
            ))}
          </div>
        </section>
      )}

      <Section n={2} icon={Target} title="Fix a broken one" hint="A small system with exactly one thing wrong. Two or three moves.">
        <div className="space-y-1.5">
          {drills.map(puzzle => {
            if (!puzzle) return null;
            const solved = !!profile.solved[puzzle.id];
            return (
              <Link key={puzzle.id} to={`/train/${puzzle.id}`}>
                <Card className={`p-3.5 hover:border-ink-500 transition group ${solved ? 'border-eval-up/40' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                        solved ? 'bg-eval-up/15 text-eval-up' : 'bg-ink-750 text-chalk-dim'
                      }`}
                    >
                      {solved ? <Check size={16} /> : <Target size={15} />}
                    </span>
                    <span className="grow min-w-0">
                      <span className="block text-[13.5px] font-bold text-chalk group-hover:text-accent transition">
                        {puzzle.title}
                      </span>
                      <span className="block text-[11.5px] text-chalk-dim mt-0.5 leading-snug line-clamp-1">
                        {puzzle.objective}
                      </span>
                    </span>
                    <Chip tone={solved ? 'up' : 'neutral'}>{solved ? 'done' : `${puzzle.maxMoves} moves`}</Chip>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section n={3} icon={Hammer} title="Build your own" hint="Open the workshop with a starting shape and make it yours.">
        <Card className="p-4">
          <p className="text-[13.5px] font-semibold text-chalk">{stage.buildLabel}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/lab/${stage.build}?stage=${stage.id}`} className="btn-primary !text-xs">
              <Wrench size={13} /> Open the workshop
            </Link>
            {progress.built ? (
              <span className="btn-ghost !text-xs !text-eval-up pointer-events-none">
                <Check size={13} /> Built
              </span>
            ) : (
              <button
                className="btn-ghost !text-xs"
                onClick={() => {
                  markBuilt(stage.id);
                  setBuilt(readBuilt());
                  toast('Marked as built. That completes the doing part of this step.', 'ok');
                }}
              >
                I have built this
              </button>
            )}
          </div>
        </Card>
      </Section>

      {progress.complete && (
        <Card className="p-4 mt-6 flex items-center gap-3" style={{ borderColor: '#F5A52455' }}>
          <Award size={18} className="shrink-0" style={{ color: '#F5A524' }} />
          <div className="grow min-w-0">
            <p className="text-[13.5px] font-bold text-chalk">You have earned the {stage.formal} certificate</p>
            <p className="text-[12px] text-chalk-dim">Claim it and you get a code anyone can verify.</p>
          </div>
          <Link to="/certificates" className="btn-primary !text-xs shrink-0">
            Claim it
          </Link>
        </Card>
      )}

      {progress.complete && nextStage && (
        <Card className="p-4 mt-6 flex items-center gap-3" style={{ borderColor: `${nextStage.hex}55` }}>
          <Check size={18} className="text-eval-up shrink-0" />
          <div className="grow min-w-0">
            <p className="text-[13.5px] font-bold text-chalk">Step {stage.n} complete</p>
            <p className="text-[12px] text-chalk-dim">Next up: {nextStage.title} — {nextStage.formal}.</p>
          </div>
          <Link to={`/journey/${nextStage.id}`} className="btn-primary !text-xs shrink-0">
            Continue <ArrowRight size={13} />
          </Link>
        </Card>
      )}

      <Modal
        open={!!openTopic}
        onClose={closeTopic}
        title={openTopic?.title ?? ''}
        wide
        footer={
          openTopic && (
            <button
              className="btn-primary !text-xs"
              onClick={() => {
                markTopic(openTopic.id, 'done');
                toast(`“${openTopic.title}” ticked off · +40 XP`, 'ok');
                closeTopic();
              }}
            >
              <Check size={13} /> Got it
            </button>
          )
        }
      >
        {openTopic && (
          <div>
            <p className="text-[13px] text-chalk-dim mb-3">{openTopic.blurb}</p>
            <div className="space-y-3">
              {openTopic.lesson.map((para, i) => (
                <p key={i} className="text-[13.5px] leading-relaxed text-chalk">
                  {para}
                </p>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Section({
  n,
  icon: Icon,
  title,
  hint,
  children,
}: {
  n: number;
  icon: typeof BookOpen;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} className="text-accent" />
        <h2 className="font-display text-[15px] font-bold">
          {n}. {title}
        </h2>
      </div>
      <p className="text-[12px] text-chalk-dim mb-2.5">{hint}</p>
      {children}
    </section>
  );
}
