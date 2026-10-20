import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { ExternalLink, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useProfile } from '../lib/profile';
import { ROADMAPS } from '../lib/curriculum';
import { Card, Chip, useToast } from '../components/ui';

interface CatalogEntry {
  slug: string;
  title: string;
}

const FEATURED = [
  'ai-agents',
  'ai-engineer',
  'prompt-engineering',
  'ai-red-teaming',
  'backend',
  'frontend',
  'devops',
  'system-design',
  'python',
  'javascript',
  'react',
  'sql',
];

export function Paths() {
  const toast = useToast();
  const topics = useProfile(s => s.profile.topics);

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const res = await api.get(`/api/roadmaps${refresh ? '?refresh=1' : ''}`);
      const list = (res.data?.roadmaps ?? []) as CatalogEntry[];
      setCatalog(list);
      setFailed(list.length === 0);
      if (refresh) toast(`${list.length} roadmaps synced from roadmap.sh`, 'ok');
    } catch {
      setFailed(true);
      if (refresh) toast('Could not reach the roadmap source right now.', 'err');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneFor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, status] of Object.entries(topics)) {
      if (status !== 'done') continue;
      const slug = key.includes('#') ? key.slice(0, key.indexOf('#')) : '';
      if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }, [topics]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? catalog.filter(r => r.slug.includes(q) || r.title.toLowerCase().includes(q)) : catalog;
    if (q) return list;
    const featured = FEATURED.map(slug => list.find(r => r.slug === slug)).filter((r): r is CatalogEntry => !!r);
    const rest = list.filter(r => !FEATURED.includes(r.slug));
    return [...featured, ...rest];
  }, [catalog, query]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Learning paths</h1>
          <p className="text-sm text-chalk-dim mt-1">
            Every official roadmap.sh path, live and interactive. Tap any node to read it, tick it off, and practise it.
          </p>
        </div>
        <button className="btn-ghost !text-xs" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync
        </button>
      </header>

      <Link to="/learn" className="block mb-4">
        <Card className="p-4 hover:border-brand/50 transition group border-brand/30 bg-brand/[0.04]">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-brand/15 text-brand grid place-items-center shrink-0">
              <Sparkles size={19} />
            </span>
            <div className="grow min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[15px] font-bold group-hover:text-brand-bright transition">UloX Core</h2>
                <Chip tone="brand">built in</Chip>
              </div>
              <p className="text-[12.5px] text-chalk-dim mt-0.5 leading-snug">
                The ITOLS curriculum written for this app — every node links straight to a tactic and a runnable graph.
              </p>
            </div>
            <span className="text-[11px] font-mono text-chalk-faint shrink-0 mt-1">{ROADMAPS.length} tracks</span>
          </div>
        </Card>
      </Link>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-chalk-faint" />
        <input
          className="field !pl-9"
          placeholder="Search 90+ roadmaps — react, kubernetes, sql, cyber security…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search roadmaps"
        />
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-[74px] rounded-xl bg-ink-800 border border-ink-700 scan animate-shimmer" />
          ))}
        </div>
      ) : failed ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-chalk">The roadmap catalogue could not be reached.</p>
          <p className="text-[12.5px] text-chalk-dim mt-1">
            UloX Core above works offline and is unaffected. Try syncing again in a moment.
          </p>
          <button className="btn-ghost !text-xs mt-4" onClick={() => load(true)}>
            <RefreshCw size={13} /> Retry
          </button>
        </Card>
      ) : (
        <>
          <p className="text-[11.5px] text-chalk-faint mb-2">
            {filtered.length} of {catalog.length} roadmaps
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(entry => {
              const done = doneFor.get(entry.slug) ?? 0;
              return (
                <Link key={entry.slug} to={`/paths/${entry.slug}`}>
                  <Card className="p-3.5 h-full hover:border-brand/50 transition group">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[14px] font-bold group-hover:text-brand-bright transition leading-snug">
                        {entry.title}
                      </h2>
                      {done > 0 && <Chip tone="up">{done} done</Chip>}
                    </div>
                    <p className="text-[11px] font-mono text-chalk-faint mt-1 truncate">roadmap.sh/{entry.slug}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-[13.5px] text-chalk">No roadmap matches “{query}”.</p>
              <a
                href="https://roadmap.sh"
                target="_blank"
                rel="noreferrer noopener"
                className="link text-[12.5px] mt-2 inline-flex items-center gap-1"
              >
                Browse roadmap.sh <ExternalLink size={12} />
              </a>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
