import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, Play, Sparkles } from 'lucide-react';
import { ROADMAPS, ROADMAP_BY_SLUG, Roadmap, TopicNode, countNodes, roadmapUrl } from '../lib/curriculum';
import { PUZZLE_BY_ID } from '../lib/puzzles';
import { useProfile } from '../lib/profile';
import { Card, Chip, Modal, Progress, useToast } from '../components/ui';

export function Learn() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const profile = useProfile(s => s.profile);
  const markTopic = useProfile(s => s.markTopic);
  const toast = useToast();

  const [openTopic, setOpenTopic] = useState<TopicNode | null>(null);

  const roadmap = slug ? ROADMAP_BY_SLUG.get(slug) : undefined;

  useEffect(() => {
    const topicId = params.get('topic');
    if (!topicId || !roadmap) return;
    for (const section of roadmap.sections) {
      const found = section.nodes.find(n => n.id === topicId);
      if (found) {
        setOpenTopic(found);
        return;
      }
    }
  }, [params, roadmap]);

  const progressFor = (r: Roadmap) => {
    const total = countNodes(r);
    const done = r.sections.reduce(
      (sum, s) => sum + s.nodes.filter(n => profile.topics[n.id] === 'done').length,
      0
    );
    return { done, total, ratio: total ? done / total : 0 };
  };

  if (!roadmap) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-5 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Roadmaps</h1>
            <p className="text-sm text-chalk-dim mt-1">
              Structured paths mirroring roadmap.sh. Every node carries ITOLS theory and drops you into a live workspace.
            </p>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROADMAPS.map(r => {
            const p = progressFor(r);
            return (
              <Link key={r.slug} to={`/learn/${r.slug}`}>
                <Card className="p-4 h-full hover:border-brand/50 transition group">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[15px] font-bold group-hover:text-brand-bright transition">{r.title}</h2>
                    <Chip tone={r.accent === 'red' ? 'brand' : 'neutral'}>{p.total} nodes</Chip>
                  </div>
                  <p className="text-[12px] text-chalk-dim mt-1 leading-snug">{r.tagline}</p>
                  <div className="mt-3">
                    <Progress value={p.ratio} tone={p.ratio === 1 ? 'up' : 'brand'} />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-chalk-faint">
                      <span>
                        {p.done}/{p.total} complete
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  const p = progressFor(roadmap);

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 lg:py-8">
      <Link to="/learn" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-chalk-dim hover:text-chalk mb-3">
        <ArrowLeft size={14} /> Roadmaps
      </Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h1 className="text-2xl font-extrabold tracking-tight">{roadmap.title}</h1>
          <a
            href={roadmapUrl(roadmap.slug)}
            target="_blank"
            rel="noreferrer noopener"
            className="chip bg-ink-700 text-chalk-dim hover:text-chalk"
          >
            roadmap.sh <ExternalLink size={11} />
          </a>
        </div>
        <p className="text-sm text-chalk-dim">{roadmap.tagline}</p>
        <div className="mt-3 max-w-sm">
          <Progress value={p.ratio} tone={p.ratio === 1 ? 'up' : 'brand'} />
          <p className="mt-1.5 text-[11px] text-chalk-faint">
            {p.done} of {p.total} nodes complete
          </p>
        </div>
      </header>

      <div className="space-y-5">
        {roadmap.sections.map(section => (
          <section key={section.id}>
            <div className="flex items-center gap-3 mb-2.5">
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-chalk-dim">{section.title}</h2>
              <div className="h-px grow bg-ink-750" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {section.nodes.map(node => {
                const status = profile.topics[node.id];
                return (
                  <button
                    key={node.id}
                    onClick={() => {
                      setOpenTopic(node);
                      markTopic(node.id, status === 'done' ? 'done' : 'seen');
                    }}
                    className={`text-left p-3.5 rounded-xl border transition group
                      ${status === 'done' ? 'bg-eval-up/8 border-eval-up/35' : 'bg-ink-800 border-ink-700 hover:border-brand/50'}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="grow min-w-0">
                        <span className="block text-[14px] font-bold text-chalk group-hover:text-brand-bright transition">
                          {node.title}
                        </span>
                        <span className="block text-[12px] text-chalk-dim mt-0.5 leading-snug">{node.blurb}</span>
                      </span>
                      {status === 'done' && <Check size={16} className="text-eval-up shrink-0 mt-0.5" />}
                    </div>
                    {node.puzzles.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {node.puzzles.slice(0, 2).map(pid => (
                          <Chip key={pid} tone="brand">
                            {PUZZLE_BY_ID.get(pid)?.title ?? pid}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      </div>

      <Modal
        open={!!openTopic}
        onClose={() => {
          setOpenTopic(null);
          params.delete('topic');
          setParams(params, { replace: true });
        }}
        title={openTopic?.title ?? ''}
        wide
        footer={
          openTopic && (
            <>
              <Link to={`/lab/${openTopic.preset ?? 'react'}`} className="btn-ghost !text-xs">
                <Play size={13} /> Build it in the Lab
              </Link>
              <button
                className="btn-primary !text-xs"
                onClick={() => {
                  markTopic(openTopic.id, 'done');
                  toast(`“${openTopic.title}” marked complete · +40 XP`, 'ok');
                  setOpenTopic(null);
                }}
              >
                <Check size={13} /> Mark complete
              </button>
            </>
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

            {openTopic.puzzles.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={13} className="text-brand" />
                  <span className="label">Practise it</span>
                </div>
                <div className="space-y-1.5">
                  {openTopic.puzzles.map(pid => {
                    const puzzle = PUZZLE_BY_ID.get(pid);
                    if (!puzzle) return null;
                    return (
                      <Link
                        key={pid}
                        to={`/train/${pid}`}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-ink-850 border border-ink-700 hover:border-brand/50 transition"
                      >
                        <span className="grow min-w-0">
                          <span className="block text-[13px] font-bold truncate">{puzzle.title}</span>
                          <span className="block text-[11px] text-chalk-faint">{puzzle.category}</span>
                        </span>
                        <Chip tone={profile.solved[pid] ? 'up' : 'brand'}>
                          {profile.solved[pid] ? 'solved' : puzzle.elo}
                        </Chip>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function useRoadmapProgress() {
  const profile = useProfile(s => s.profile);
  return useMemo(
    () =>
      ROADMAPS.map(r => {
        const total = countNodes(r);
        const done = r.sections.reduce((sum, s) => sum + s.nodes.filter(n => profile.topics[n.id] === 'done').length, 0);
        return { slug: r.slug, title: r.title, done, total };
      }),
    [profile.topics]
  );
}
