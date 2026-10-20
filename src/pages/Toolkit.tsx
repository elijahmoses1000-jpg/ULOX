import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { BookOpen, Compass, ExternalLink, FileText, Hammer, Plug, Search, Sparkles, Star, Target } from 'lucide-react';
import { Card, Chip, Empty, Tabs, useToast } from '../components/ui';

type KindId = 'apis' | 'projects' | 'books' | 'lists' | 'practice' | 'cheatsheets' | 'careers' | 'builds';

interface ResourceItem {
  title: string;
  url: string;
  group: string;
  note?: string;
  meta?: string;
}

interface Payload {
  items: ResourceItem[];
  groups: string[];
  total: number;
  label: string;
  blurb: string;
  repo: string;
  source: string;
}

const TABS: Array<{ id: KindId; label: string; icon: typeof Plug; pitch: string }> = [
  { id: 'cheatsheets', label: 'Field notes', icon: FileText, pitch: 'One-page references on agents, harnesses, graphs and evals.' },
  { id: 'apis', label: 'APIs', icon: Plug, pitch: 'Real APIs you can plug into an agent as a Tool.' },
  { id: 'builds', label: 'Challenges', icon: Target, pitch: 'Graded projects with stages and an hour estimate.' },
  { id: 'careers', label: 'Careers', icon: Compass, pitch: 'Where these skills lead, and the hours each route takes.' },
  { id: 'projects', label: 'Clone it', icon: Hammer, pitch: 'Rebuild the real thing from scratch, step by step.' },
  { id: 'practice', label: 'Practice', icon: Star, pitch: 'freeCodeCamp certifications and challenge blocks.' },
  { id: 'books', label: 'Books', icon: BookOpen, pitch: 'Free books and courses, by language and subject.' },
  { id: 'lists', label: 'Lists', icon: Sparkles, pitch: 'The awesome index — a curated list for almost anything.' },
];

/** The Lab reads this on mount and offers to add the API as a Tool node. */
export const LAB_TOOL_KEY = 'ulox.labtool.v1';

export function Toolkit() {
  const navigate = useNavigate();
  const toast = useToast();

  const [kind, setKind] = useState<KindId>('cheatsheets');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ limit: '60' });
      if (query.trim()) params.set('q', query.trim());
      if (group) params.set('group', group);
      const res = await api.get(`/api/resources/${kind}?${params.toString()}`);
      setData(res.data ?? null);
      setFailed(!res.data?.items?.length && !query.trim() && !group);
    } catch {
      setFailed(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [kind, query, group]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    setGroup('');
  }, [kind]);

  const useInLab = (item: ResourceItem) => {
    try {
      localStorage.setItem(
        LAB_TOOL_KEY,
        JSON.stringify({ name: item.title, url: item.url, note: item.note ?? '', meta: item.meta ?? '' })
      );
    } catch {
      /* private mode — the Lab just will not pre-fill */
    }
    toast(`${item.title} is ready to drop into your next diagram.`, 'ok');
    navigate('/lab');
  };

  const active = TABS.find(t => t.id === kind)!;

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Toolkit</h1>
        <p className="text-sm text-chalk-dim mt-1 max-w-2xl">
          Five open collections, searchable in one place. Everything here is a real link to a real resource — nothing is
          generated.
        </p>
      </header>

      <Tabs<KindId> active={kind} onChange={setKind} tabs={TABS.map(t => ({ id: t.id, label: t.label }))} className="mb-3" />

      <div className="flex items-start gap-2 mb-3">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/12 text-accent shrink-0">
          <active.icon size={17} />
        </span>
        <p className="text-[13px] text-chalk-dim leading-snug pt-1.5">{active.pitch}</p>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-chalk-faint" />
        <input
          className="field !pl-9"
          placeholder={`Search ${active.label.toLowerCase()}…`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={`Search ${active.label}`}
        />
      </div>

      {data && data.groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3 max-h-24 overflow-y-auto">
          <button
            onClick={() => setGroup('')}
            className={`chip border ${!group ? 'bg-accent/20 text-accent border-accent/50' : 'bg-ink-850 text-chalk-dim border-ink-700'}`}
          >
            All
          </button>
          {data.groups.slice(0, 60).map(g => (
            <button
              key={g}
              onClick={() => setGroup(g === group ? '' : g)}
              className={`chip border ${g === group ? 'bg-accent/20 text-accent border-accent/50' : 'bg-ink-850 text-chalk-dim border-ink-700'}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[78px] rounded-xl bg-ink-800 border border-ink-700 scan animate-shimmer" />
          ))}
        </div>
      ) : failed ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-chalk">This collection could not be loaded right now.</p>
          <p className="text-[12.5px] text-chalk-dim mt-1">
            It is fetched live from GitHub and cached. Try again in a moment.
          </p>
          <button className="btn-ghost !text-xs mt-4" onClick={() => void load()}>
            Retry
          </button>
        </Card>
      ) : !data?.items.length ? (
        <Empty title={`Nothing matches “${query}”`} hint="Try a broader word, or clear the category filter." />
      ) : (
        <>
          <p className="text-[11.5px] text-chalk-faint mb-2">
            Showing {data.items.length} of {data.total} · from{' '}
            <a
              href={`https://github.com/${data.repo}`}
              target="_blank"
              rel="noreferrer noopener"
              className="link"
            >
              {data.source}
            </a>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.items.map(item => (
              <Card key={item.url + item.title} className="p-3.5 flex flex-col">
                <div className="flex items-start gap-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[14px] font-bold text-chalk hover:text-accent transition grow leading-snug"
                  >
                    {item.title}
                  </a>
                  <ExternalLink size={13} className="text-chalk-faint shrink-0 mt-1" />
                </div>
                {item.note && <p className="text-[12px] text-chalk-dim mt-1 leading-snug">{item.note}</p>}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Chip>{item.group}</Chip>
                  {item.meta && <Chip tone="info">{item.meta}</Chip>}
                  {kind === 'apis' && (
                    <button className="btn-ghost !px-2 !py-1 !text-[11px] ml-auto" onClick={() => useInLab(item)}>
                      <Sparkles size={11} /> Use in Lab
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {data.total > data.items.length && (
            <p className="text-center text-[12px] text-chalk-faint mt-4">
              {data.total - data.items.length} more — narrow it with the search box or a category.
            </p>
          )}
        </>
      )}
    </div>
  );
}
