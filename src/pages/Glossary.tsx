import { useCallback, useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { AlertTriangle, BookOpen, ExternalLink, Lightbulb, Search, Wrench } from 'lucide-react';
import { Card, Chip, Empty, useToast } from '../components/ui';

interface Term {
  term: string;
  category: string;
  means: string;
  why: string;
  practice: string;
  confusion: string;
  related: string[];
  aliases: string[];
  learn: string;
}

interface Payload {
  terms: Term[];
  categories: string[];
  total: number;
  all: number;
  repo: string;
}

/**
 * The jargon desk. UloX's whole premise is that people bounce off agentic
 * engineering because the vocabulary arrives faster than the explanation, so
 * every term gets a plain definition, why it matters, and — most usefully — the
 * thing it is commonly mistaken for.
 */
export function Glossary() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ limit: '60' });
      if (query.trim()) params.set('q', query.trim());
      if (category) params.set('category', category);
      const res = await api.get(`/api/glossary?${params.toString()}`);
      setData(res.data ?? null);
      setFailed(!res.data?.terms?.length && !query.trim() && !category);
    } catch {
      setFailed(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query, category]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Jargon desk</h1>
        <p className="text-sm text-chalk-dim mt-1 max-w-2xl">
          Every term this field throws at you, in plain words — what it means, why it matters, and what people usually
          mistake it for. Search a word the moment it trips you up.
        </p>
      </header>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-chalk-faint" />
        <input
          className="field !pl-9"
          placeholder="Search a term — RAG, eval, context window, MCP…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search the glossary"
          autoFocus
        />
      </div>

      {data && data.categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setCategory('')}
            className={`chip border ${!category ? 'bg-accent/20 text-accent border-accent/50' : 'bg-ink-850 text-chalk-dim border-ink-700'}`}
          >
            All
          </button>
          {data.categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? '' : c)}
              className={`chip border ${c === category ? 'bg-accent/20 text-accent border-accent/50' : 'bg-ink-850 text-chalk-dim border-ink-700'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl bg-ink-800 border border-ink-700 scan animate-shimmer" />
          ))}
        </div>
      ) : failed ? (
        <Card className="p-6 text-center">
          <p className="text-[13.5px] text-chalk">The glossary could not be loaded right now.</p>
          <p className="text-[12.5px] text-chalk-dim mt-1">It is read live from GitHub and cached. Try again shortly.</p>
          <button className="btn-ghost !text-xs mt-4" onClick={() => void load()}>
            Retry
          </button>
        </Card>
      ) : !data?.terms.length ? (
        <Empty
          title={`Nothing matches “${query}”`}
          hint="Try a shorter word, or clear the category filter."
          action={
            <button className="btn-ghost !text-xs" onClick={() => { setQuery(''); setCategory(''); }}>
              Clear search
            </button>
          }
        />
      ) : (
        <>
          <p className="text-[11.5px] text-chalk-faint mb-2">
            Showing {data.terms.length} of {data.total}
            {data.all ? ` · ${data.all} terms indexed` : ''} · from{' '}
            <a href={`https://github.com/${data.repo}`} target="_blank" rel="noreferrer noopener" className="link">
              ai-engineering-from-scratch
            </a>
          </p>

          <div className="space-y-2">
            {data.terms.map(t => {
              const open = openTerm === t.term;
              return (
                <Card key={t.term} className="overflow-hidden">
                  <button
                    className="w-full text-left p-4 hover:bg-ink-850/60 transition"
                    onClick={() => setOpenTerm(open ? null : t.term)}
                    aria-expanded={open}
                  >
                    <div className="flex items-start gap-2 flex-wrap">
                      <h2 className="font-display text-[15.5px] font-bold text-chalk">{t.term}</h2>
                      <Chip>{t.category}</Chip>
                      {t.aliases.slice(0, 2).map(a => (
                        <Chip key={a} tone="info">
                          {a}
                        </Chip>
                      ))}
                    </div>
                    <p className="text-[13px] text-chalk-dim mt-1.5 leading-relaxed">{t.means}</p>
                    {!open && (t.why || t.confusion) && (
                      <span className="inline-block mt-2 text-[11px] font-bold text-accent">More ↓</span>
                    )}
                  </button>

                  {open && (
                    <div className="px-4 pb-4 space-y-3 border-t border-ink-750 pt-3">
                      {t.why && <Facet icon={Lightbulb} tone="#F5A524" label="Why it matters" body={t.why} />}
                      {t.practice && <Facet icon={Wrench} tone="#4EA8FF" label="In practice" body={t.practice} />}
                      {t.confusion && (
                        <Facet icon={AlertTriangle} tone="#FF5A5F" label="Commonly mistaken for" body={t.confusion} />
                      )}
                      {t.learn && <Facet icon={BookOpen} tone="#3FD07A" label="Learn it" body={t.learn} />}

                      {t.related.length > 0 && (
                        <div>
                          <p className="label mb-1.5">Related</p>
                          <div className="flex flex-wrap gap-1.5">
                            {t.related.map(r => (
                              <button
                                key={r}
                                onClick={() => {
                                  setCategory('');
                                  setQuery(r);
                                  setOpenTerm(null);
                                  toast(`Looking up “${r}”`, 'info');
                                }}
                                className="chip bg-ink-750 text-chalk-dim border border-ink-700 hover:text-chalk hover:border-accent/50"
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {data.total > data.terms.length && (
            <p className="text-center text-[12px] text-chalk-faint mt-4">
              {data.total - data.terms.length} more — narrow it with the search box.
            </p>
          )}

          <p className="text-center text-[11px] text-chalk-faint mt-6">
            Definitions from{' '}
            <a
              href={`https://github.com/${data.repo}/blob/main/glossary/terms.md`}
              target="_blank"
              rel="noreferrer noopener"
              className="link inline-flex items-center gap-1"
            >
              ai-engineering-from-scratch <ExternalLink size={10} />
            </a>
          </p>
        </>
      )}
    </div>
  );
}

function Facet({
  icon: Icon,
  tone,
  label,
  body,
}: {
  icon: typeof Lightbulb;
  tone: string;
  label: string;
  body: string;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className="w-6 h-6 rounded-lg grid place-items-center shrink-0 mt-0.5"
        style={{ background: `${tone}1F`, color: tone }}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tone }}>
          {label}
        </p>
        <p className="text-[13px] text-chalk-dim leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}
