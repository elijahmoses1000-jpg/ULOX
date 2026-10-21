import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { Eye, GitFork, Hammer, Sparkles, Trash2 } from 'lucide-react';
import { useProfile } from '../lib/profile';
import { Card, Chip, Empty, Tabs, useToast } from '../components/ui';

interface Row {
  code: string;
  title: string;
  note: string;
  authorName: string;
  origin: string;
  score: number;
  createdAt: number;
  views: number;
  remixes: number;
  graph: { nodes: unknown[]; edges: unknown[] };
}

type View = 'all' | 'mine';

/**
 * Published builds.
 *
 * Ranked by remixes before views, because the loop that matters is people
 * building on each other's work — a build nobody opened in the Lab has not
 * really spread, however many times it was looked at.
 */
export function Gallery() {
  const profile = useProfile(s => s.profile);
  const [view, setView] = useState<View>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const toast = useToast();

  /**
   * Remove a build you published. Two taps rather than a browser confirm():
   * publishing is undoable by deleting, but deleting is not undoable at all,
   * so the second tap has to be deliberate.
   */
  const remove = async (code: string) => {
    setRemoving(code);
    try {
      await api.post(`/api/shares/${encodeURIComponent(code)}/delete`, { playerId: profile.playerId });
      setRows(prev => prev.filter(r => r.code !== code));
      toast('Build removed. The link no longer opens.', 'ok');
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast(status === 403 ? 'That build was published by someone else.' : 'Could not remove that build.', 'err');
    } finally {
      setRemoving(null);
      setConfirming(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Both branches call api.get with a literal on purpose: scripts/audit.ts
    // matches calls syntactically, and a url built into a variable first is
    // invisible to it — which would quietly cost us the dead-endpoint check.
    const request =
      view === 'mine'
        ? api.get(`/api/shares?playerId=${encodeURIComponent(profile.playerId)}`)
        : api.get('/api/shares');
    request
      .then(res => !cancelled && setRows(res.data?.shares ?? []))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [view, profile.playerId]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Published builds</h1>
        <p className="text-sm text-chalk-dim mt-1 max-w-2xl">
          Agents people built in the Lab and published. Open one to replay its run step by step, then fork it into your
          own Lab and change it.
        </p>
      </header>

      <Tabs<View>
        active={view}
        onChange={setView}
        tabs={[
          { id: 'all', label: 'Most remixed' },
          { id: 'mine', label: 'Mine' },
        ]}
      />

      <div className="mt-3 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[86px] rounded-xl bg-ink-800 border border-ink-700 scan animate-shimmer" />
          ))
        ) : rows.length === 0 ? (
          <Empty
            icon={<Sparkles size={22} />}
            title={view === 'mine' ? 'You have not published a build yet' : 'Nothing published yet'}
            hint={
              view === 'mine'
                ? 'Build something in the Lab, then use “Share build” to get a link and a card.'
                : 'Be the first — build an agent in the Lab and publish it.'
            }
            action={
              <Link to="/lab" className="btn-primary !text-xs">
                <Hammer size={13} /> Open the Lab
              </Link>
            }
          />
        ) : (
          rows.map(row => (
            <Link key={row.code} to={`/b/${row.code}`} className="block">
              <Card className="p-4 hover:border-ink-500 transition">
                <div className="flex items-start gap-3">
                  <div className="grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-[15px] font-bold truncate">{row.title}</h2>
                      {row.remixes >= 3 && <Chip tone="warn">catching on</Chip>}
                    </div>
                    <p className="text-[12px] text-chalk-dim mt-0.5">
                      by {row.authorName}
                      {row.origin ? ` · ${row.origin}` : ''}
                    </p>
                    {row.note && <p className="text-[12px] text-chalk-faint mt-1.5 truncate-2">{row.note}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-chalk-faint flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <GitFork size={11} /> {row.remixes}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye size={11} /> {row.views}
                      </span>
                      <span>{row.graph?.nodes?.length ?? 0} nodes</span>
                      {view === 'mine' &&
                        (confirming === row.code ? (
                          <span className="inline-flex items-center gap-1.5 ml-auto">
                            <span className="text-chalk-dim">Remove for good?</span>
                            <button
                              className="btn-primary !px-2 !py-0.5 !text-[10.5px]"
                              disabled={removing === row.code}
                              onClick={e => {
                                e.preventDefault();
                                void remove(row.code);
                              }}
                            >
                              {removing === row.code ? 'Removing…' : 'Yes, remove'}
                            </button>
                            <button
                              className="btn-quiet !px-2 !py-0.5 !text-[10.5px]"
                              onClick={e => {
                                e.preventDefault();
                                setConfirming(null);
                              }}
                            >
                              Keep
                            </button>
                          </span>
                        ) : (
                          <button
                            className="btn-quiet !px-2 !py-0.5 !text-[10.5px] ml-auto"
                            onClick={e => {
                              e.preventDefault();
                              setConfirming(row.code);
                            }}
                          >
                            <Trash2 size={11} /> Remove
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className="font-display text-xl font-bold tabular-nums"
                      style={{ color: row.score >= 0 ? '#3FD07A' : '#EE1B24' }}
                    >
                      {row.score >= 0 ? '+' : ''}
                      {row.score.toFixed(1)}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
