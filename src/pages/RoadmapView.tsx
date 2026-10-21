import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@appdeploy/client';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  Layers,
  List,
  Loader2,
  Map as MapIcon,
  Minus,
  Play,
  Plus,
  Rss,
  Search,
  Sparkles,
  Star,
  Target,
  Youtube,
} from 'lucide-react';
import { useProfile } from '../lib/profile';
import { useLevel } from '../lib/level';
import { Markdown } from '../components/Markdown';
import { Card, Chip, Modal, Progress, useToast } from '../components/ui';

type Side = 'top' | 'right' | 'bottom' | 'left';

interface SlimNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fs?: number;
  colour?: string;
}

interface SlimEdge {
  source: string;
  target: string;
  from: Side;
  to: Side;
  dashed: boolean;
}

interface Structure {
  slug: string;
  title: string;
  description: string;
  nodes: SlimNode[];
  edges: SlimEdge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  topicCount: number;
}

type ResourceKind = 'video' | 'article' | 'official' | 'course' | 'feed' | 'opensource' | 'link';

interface TopicResource {
  kind: ResourceKind;
  title: string;
  url: string;
}

interface Lesson {
  slug: string;
  nodeId: string;
  label: string;
  markdown: string;
  resources: TopicResource[];
  source: 'roadmap.sh' | 'ulox-ai';
}

const CLICKABLE = new Set(['topic', 'subtopic']);

const RESOURCE_META: Record<ResourceKind, { icon: typeof FileText; label: string; tone: string }> = {
  video: { icon: Youtube, label: 'Watch', tone: '#FF5A5F' },
  course: { icon: Star, label: 'Course', tone: '#F5A524' },
  official: { icon: BookOpen, label: 'Official docs', tone: '#4EA8FF' },
  article: { icon: FileText, label: 'Read', tone: '#A5ABB3' },
  feed: { icon: Rss, label: 'Feed', tone: '#B57BFF' },
  opensource: { icon: Star, label: 'Source', tone: '#3FD07A' },
  link: { icon: ExternalLink, label: 'Link', tone: '#A5ABB3' },
};

/** Where a connector meets a node, given the side upstream recorded. */
function anchor(node: SlimNode, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: node.x + node.w / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.w / 2, y: node.y + node.h };
    case 'left':
      return { x: node.x, y: node.y + node.h / 2 };
    default:
      return { x: node.x + node.w, y: node.y + node.h / 2 };
  }
}

/** Push the control point out along the side normal so curves leave cleanly. */
function control(p: { x: number; y: number }, side: Side, reach: number) {
  switch (side) {
    case 'top':
      return { x: p.x, y: p.y - reach };
    case 'bottom':
      return { x: p.x, y: p.y + reach };
    case 'left':
      return { x: p.x - reach, y: p.y };
    default:
      return { x: p.x + reach, y: p.y };
  }
}

export function RoadmapView() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const topics = useProfile(s => s.profile.topics);
  const markTopic = useProfile(s => s.markTopic);
  const level = useLevel(s => s.level);

  const [structure, setStructure] = useState<Structure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'map' | 'list'>(level === 'beginner' ? 'list' : 'map');
  const [zoom, setZoom] = useState(1);

  const [openNode, setOpenNode] = useState<SlimNode | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);

  const holderRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(900);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .get(`/api/roadmaps/${slug}`)
      .then(res => {
        if (cancelled) return;
        setStructure(res.data?.roadmap ?? null);
        if (!res.data?.roadmap) setError('That roadmap could not be loaded.');
      })
      .catch(() => !cancelled && setError('That roadmap could not be loaded right now.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useLayoutEffect(() => {
    const measure = () => setAvailable(holderRef.current?.clientWidth ?? 900);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [structure, view]);

  const key = useCallback((nodeId: string) => `${slug}#${nodeId}`, [slug]);

  const { scale, width, height } = useMemo(() => {
    if (!structure) return { scale: 1, width: 0, height: 0 };
    const w = Math.max(1, structure.bounds.maxX - structure.bounds.minX);
    const h = Math.max(1, structure.bounds.maxY - structure.bounds.minY);
    const fit = Math.min(1.05, (available - 8) / w);
    const s = Math.max(0.28, fit * zoom);
    return { scale: s, width: w * s, height: h * s };
  }, [structure, available, zoom]);

  const nodeById = useMemo(() => new Map((structure?.nodes ?? []).map(n => [n.id, n])), [structure]);

  const doneCount = useMemo(() => {
    if (!structure) return 0;
    return structure.nodes.filter(n => CLICKABLE.has(n.type) && topics[key(n.id)] === 'done').length;
  }, [structure, topics, key]);

  const openTopic = async (node: SlimNode) => {
    setOpenNode(node);
    setLesson(null);
    setLessonLoading(true);
    markTopic(key(node.id), topics[key(node.id)] === 'done' ? 'done' : 'seen');
    try {
      const res = await api.post(`/api/roadmaps/${slug}/topic`, { nodeId: node.id, label: node.label });
      setLesson(res.data?.lesson ?? null);
    } catch {
      setLesson(null);
    } finally {
      setLessonLoading(false);
    }
  };

  const grouped = useMemo(() => {
    if (!structure) return [] as Array<{ heading: string; nodes: SlimNode[] }>;
    const headers = structure.nodes
      .filter(n => n.type === 'section' || n.type === 'label' || n.type === 'title')
      .sort((a, b) => a.y - b.y);
    // A beginner sees the main topics only; sub-topics are noise until the
    // shape of the path is familiar.
    const wanted = level === 'beginner' ? new Set(['topic']) : CLICKABLE;
    const clickable = structure.nodes.filter(n => wanted.has(n.type)).sort((a, b) => a.y - b.y || a.x - b.x);

    const buckets = new Map<string, SlimNode[]>();
    for (const node of clickable) {
      let heading = 'Topics';
      for (const header of headers) {
        if (header.y <= node.y + 4) heading = header.label;
        else break;
      }
      const list = buckets.get(heading) ?? [];
      list.push(node);
      buckets.set(heading, list);
    }
    return Array.from(buckets, ([heading, nodes]) => ({ heading, nodes }));
  }, [structure, level]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-chalk-dim">
        <Loader2 size={22} className="animate-spin mx-auto mb-3" />
        Loading the roadmap…
      </div>
    );
  }

  if (error || !structure) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center">
        <p className="text-chalk-dim">{error || 'That roadmap is unavailable.'}</p>
        <Link to="/paths" className="btn-primary mt-4">
          All learning paths
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 lg:py-6">
      <Link to="/paths" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-chalk-dim hover:text-chalk mb-3">
        <ArrowLeft size={14} /> Learning paths
      </Link>

      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">{structure.title}</h1>
          <a
            href={`https://roadmap.sh/${slug}`}
            target="_blank"
            rel="noreferrer noopener"
            className="chip bg-ink-700 text-chalk-dim hover:text-chalk"
          >
            roadmap.sh <ExternalLink size={11} />
          </a>
        </div>
        {structure.description && <p className="text-sm text-chalk-dim">{structure.description}</p>}
        <p className="text-[12.5px] text-chalk-dim mt-1.5">
          Tap any box to read it, watch a video on it, and tick it off.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="grow max-w-sm">
            <Progress value={structure.topicCount ? doneCount / structure.topicCount : 0} tone={doneCount === structure.topicCount ? 'up' : 'brand'} />
            <p className="mt-1.5 text-[11px] text-chalk-faint">
              {doneCount} of {structure.topicCount} topics complete
            </p>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {/* Zoom sits with the other view controls. Floating over the map,
                it covered whichever box happened to be in the corner. */}
            {view === 'map' && (
              <>
                <button
                  className="btn btn-ghost !px-2 !py-1.5"
                  onClick={() => setZoom(z => Math.max(0.5, z / 1.2))}
                  aria-label="Zoom out"
                >
                  <Minus size={13} />
                </button>
                <button
                  className="btn btn-ghost !px-2 !py-1.5"
                  onClick={() => setZoom(z => Math.min(2.2, z * 1.2))}
                  aria-label="Zoom in"
                >
                  <Plus size={13} />
                </button>
                {zoom !== 1 && (
                  <button className="btn btn-quiet !px-2 !py-1.5 !text-[11px]" onClick={() => setZoom(1)}>
                    Fit
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setView('list')}
              className={`btn ${view === 'list' ? 'btn-primary' : 'btn-ghost'} !px-2.5 !py-1.5 !text-[11px]`}
            >
              <List size={13} /> Checklist
            </button>
            <button
              onClick={() => setView('map')}
              className={`btn ${view === 'map' ? 'btn-primary' : 'btn-ghost'} !px-2.5 !py-1.5 !text-[11px]`}
            >
              <MapIcon size={13} /> Map
            </button>
          </div>
        </div>
      </header>

      {view === 'map' ? (
        <Card className="p-2">
          <div ref={holderRef} className="overflow-x-auto no-scrollbar">
            <div className="relative mx-auto" style={{ width, height }}>
              {/* Connectors sit behind the boxes, drawn from the sides upstream recorded. */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={width}
                height={height}
                aria-hidden="true"
              >
                {structure.edges.map((edge, i) => {
                  const a = nodeById.get(edge.source);
                  const b = nodeById.get(edge.target);
                  if (!a || !b) return null;
                  const p1 = anchor(a, edge.from);
                  const p2 = anchor(b, edge.to);
                  const reach = Math.max(28, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.38);
                  const c1 = control(p1, edge.from, reach);
                  const c2 = control(p2, edge.to, reach);
                  const px = (v: number, axis: 'x' | 'y') =>
                    (v - (axis === 'x' ? structure.bounds.minX : structure.bounds.minY)) * scale;
                  const done = topics[key(edge.source)] === 'done' && topics[key(edge.target)] === 'done';
                  return (
                    <path
                      key={`${edge.source}-${edge.target}-${i}`}
                      d={`M ${px(p1.x, 'x')} ${px(p1.y, 'y')} C ${px(c1.x, 'x')} ${px(c1.y, 'y')}, ${px(c2.x, 'x')} ${px(
                        c2.y,
                        'y'
                      )}, ${px(p2.x, 'x')} ${px(p2.y, 'y')}`}
                      fill="none"
                      stroke={done ? '#3FD07A' : '#4EA8FF'}
                      strokeOpacity={done ? 0.9 : 0.55}
                      strokeWidth={Math.max(1.4, 3 * scale)}
                      strokeLinecap="round"
                      strokeDasharray={edge.dashed ? `${Math.max(1, 1.5 * scale)} ${Math.max(4, 8 * scale)}` : undefined}
                    />
                  );
                })}
              </svg>

              {structure.nodes.map(node => {
                const left = (node.x - structure.bounds.minX) * scale;
                const top = (node.y - structure.bounds.minY) * scale;
                const w = node.w * scale;
                const h = node.h * scale;
                const fontSize = Math.max(8, (node.fs ?? 14) * scale * 0.92);
                const isDone = topics[key(node.id)] === 'done';
                const isSeen = topics[key(node.id)] === 'seen';

                if (node.type === 'title') {
                  return (
                    <div
                      key={node.id}
                      className="absolute font-display font-bold text-chalk flex items-center justify-center text-center"
                      style={{ left, top, width: w, height: h, fontSize: Math.max(13, fontSize * 1.1) }}
                    >
                      {node.label}
                    </div>
                  );
                }
                if (node.type === 'section' || node.type === 'label') {
                  return (
                    <div
                      key={node.id}
                      className="absolute font-bold text-chalk-dim flex items-center"
                      style={{ left, top, width: w, height: h, fontSize: Math.max(9, fontSize) }}
                    >
                      {node.label}
                    </div>
                  );
                }
                if (node.type === 'paragraph') {
                  return (
                    <div
                      key={node.id}
                      className="absolute text-chalk-faint leading-snug overflow-hidden"
                      style={{ left, top, width: w, height: h, fontSize: Math.max(8, fontSize * 0.92) }}
                    >
                      {node.label}
                    </div>
                  );
                }
                if (node.type === 'button' || node.type === 'linksgroup') {
                  return (
                    <div
                      key={node.id}
                      className="absolute rounded-md border border-ink-600 bg-ink-850 text-chalk-dim flex items-center justify-center text-center px-1 overflow-hidden"
                      style={{ left, top, width: w, height: h, fontSize: Math.max(8, fontSize * 0.9) }}
                    >
                      {node.label}
                    </div>
                  );
                }

                const isTopic = node.type === 'topic';
                return (
                  <button
                    key={node.id}
                    onClick={() => openTopic(node)}
                    title={node.label}
                    className={`absolute rounded-md border px-1.5 flex items-center justify-center text-center leading-tight
                      overflow-hidden transition hover:z-10 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent
                      ${
                        isDone
                          ? 'bg-eval-up/18 border-eval-up text-eval-up font-bold'
                          : isTopic
                            ? 'bg-brand/12 border-brand/60 text-chalk font-bold hover:bg-brand/20'
                            : `bg-ink-800 border-ink-600 text-chalk-dim hover:border-brand/60 ${isSeen ? 'border-ink-500' : ''}`
                      }`}
                    style={{ left, top, width: w, height: h, fontSize: Math.max(8, fontSize * 0.86) }}
                  >
                    <span className="truncate-2">{node.label}</span>
                    {isDone && <Check size={Math.max(8, 11 * scale)} className="absolute right-1 top-1" />}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-center text-[11px] text-chalk-faint py-2">
            Scroll to move down the path, + / − to zoom. Dotted lines show what leads to what.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <section key={group.heading}>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-chalk-dim flex items-center gap-1.5">
                  <Layers size={13} /> {group.heading}
                </h2>
                <div className="h-px grow bg-ink-750" />
                <span className="text-[11px] font-mono shrink-0 text-chalk-faint">
                  {group.nodes.filter(n => topics[key(n.id)] === 'done').length}/{group.nodes.length}
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.nodes.map(node => {
                  const isDone = topics[key(node.id)] === 'done';
                  return (
                    <button
                      key={node.id}
                      onClick={() => openTopic(node)}
                      className={`text-left px-3.5 py-2.5 rounded-lg border transition flex items-center gap-2
                        ${isDone ? 'bg-eval-up/8 border-eval-up/40' : 'bg-ink-800 border-ink-700 hover:border-accent/60'}`}
                    >
                      <span className="text-[13px] font-semibold text-chalk grow">{node.label}</span>
                      {node.type === 'subtopic' && <Chip>sub</Chip>}
                      {isDone && <Check size={15} className="text-eval-up shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!openNode}
        onClose={() => setOpenNode(null)}
        title={openNode?.label ?? ''}
        wide
        footer={
          openNode && (
            <>
              <Link to="/lab" className="btn-ghost !text-xs">
                <Target size={13} /> Build it in the Lab
              </Link>
              <button
                className="btn-primary !text-xs"
                onClick={() => {
                  markTopic(key(openNode.id), 'done');
                  toast(`“${openNode.label}” ticked off · +40 XP`, 'ok');
                  setOpenNode(null);
                }}
              >
                <Check size={13} /> Mark complete
              </button>
            </>
          )
        }
      >
        {lessonLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-3.5 rounded bg-ink-750 scan animate-shimmer" style={{ width: `${95 - i * 9}%` }} />
            ))}
          </div>
        ) : lesson ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Chip tone={lesson.source === 'roadmap.sh' ? 'info' : 'brand'}>
                {lesson.source === 'roadmap.sh' ? 'from roadmap.sh' : 'written by UloX'}
              </Chip>
              {lesson.source === 'ulox-ai' && (
                <span className="text-[11px] text-chalk-faint flex items-center gap-1">
                  <Sparkles size={11} /> no upstream notes for this node yet
                </span>
              )}
            </div>
            {/* The resource links are rendered properly below, so drop the raw
                "Visit the following resources" list from the prose. */}
            <Markdown source={lesson.markdown.split(/\n[^\n]*Visit the following resources[^\n]*\n/i)[0]} />
            <TopicResources label={openNode?.label ?? ''} resources={lesson.resources ?? []} />
          </>
        ) : (
          <p className="text-[13.5px] text-chalk-dim">
            Notes for this topic could not be loaded. Open it on{' '}
            <a href={`https://roadmap.sh/${slug}`} target="_blank" rel="noreferrer noopener" className="link">
              roadmap.sh
            </a>{' '}
            instead.
          </p>
        )}
      </Modal>
    </div>
  );
}

/**
 * Videos first, because that is what most people want when a topic is new, then
 * everything else. When upstream has no video we offer a YouTube *search* and
 * say so — a made-up video id would just be a dead link.
 */
function TopicResources({ label, resources }: { label: string; resources: TopicResource[] }) {
  const videos = resources.filter(r => r.kind === 'video');
  const rest = resources.filter(r => r.kind !== 'video');
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${label} tutorial`)}`;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-1.5 mb-2">
        <Youtube size={14} className="text-eval-down" />
        <span className="label">Watch</span>
      </div>

      {videos.length > 0 ? (
        <div className="space-y-1.5">
          {videos.map(r => (
            <ResourceRow key={r.url} resource={r} />
          ))}
        </div>
      ) : (
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2.5 p-3 rounded-lg bg-ink-850 border border-ink-700 hover:border-eval-down/60 transition group"
        >
          <span className="w-8 h-8 rounded-lg grid place-items-center bg-eval-down/12 text-eval-down shrink-0">
            <Search size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold group-hover:text-eval-down transition">
              Search YouTube for “{label}”
            </span>
            <span className="block text-[11.5px] text-chalk-faint">
              roadmap.sh has no video pinned to this topic yet
            </span>
          </span>
          <ExternalLink size={14} className="ml-auto text-chalk-faint shrink-0" />
        </a>
      )}

      {rest.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 mt-5 mb-2">
            <BookOpen size={14} className="text-eval-info" />
            <span className="label">Read</span>
          </div>
          <div className="space-y-1.5">
            {rest.map(r => (
              <ResourceRow key={r.url} resource={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ResourceRow({ resource }: { resource: TopicResource }) {
  const meta = RESOURCE_META[resource.kind] ?? RESOURCE_META.link;
  const Icon = meta.icon;
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-2.5 p-2.5 rounded-lg bg-ink-850 border border-ink-700 hover:border-accent/60 transition group"
    >
      <span
        className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
        style={{ background: `${meta.tone}1F`, color: meta.tone }}
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 grow">
        <span className="block text-[12.5px] font-semibold text-chalk truncate group-hover:text-accent transition">
          {resource.title}
        </span>
        <span className="block text-[10.5px] uppercase tracking-wide" style={{ color: meta.tone }}>
          {meta.label}
        </span>
      </span>
      {resource.kind === 'video' ? (
        <Play size={14} className="text-chalk-faint shrink-0" />
      ) : (
        <ExternalLink size={13} className="text-chalk-faint shrink-0" />
      )}
    </a>
  );
}
