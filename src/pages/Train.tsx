import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Timer, TrendingUp, Zap } from 'lucide-react';
import { CATEGORIES, PUZZLES, PuzzleCategory } from '../lib/puzzles';
import { expectedScore } from '../lib/glicko';
import { useProfile } from '../lib/profile';
import { Card, Chip, Progress } from '../components/ui';
import { T, useT } from '../components/Level';

type Filter = 'all' | PuzzleCategory;
type Sort = 'elo' | 'unsolved' | 'match';

export function Train() {
  const profile = useProfile(s => s.profile);
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('match');

  const list = useMemo(() => {
    const filtered = PUZZLES.filter(p => filter === 'all' || p.category === filter);
    const withMeta = filtered.map(p => ({
      puzzle: p,
      solved: !!profile.solved[p.id],
      odds: expectedScore(profile.rating, { rating: p.elo, rd: 80, vol: 0.06 }),
    }));
    if (sort === 'elo') return withMeta.sort((a, b) => a.puzzle.elo - b.puzzle.elo);
    if (sort === 'unsolved') return withMeta.sort((a, b) => Number(a.solved) - Number(b.solved) || a.puzzle.elo - b.puzzle.elo);
    return withMeta.sort((a, b) => Math.abs(a.odds - 0.6) - Math.abs(b.odds - 0.6));
  }, [filter, sort, profile.solved, profile.rating]);

  const solvedCount = PUZZLES.filter(p => profile.solved[p.id]).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          <T k="tactics" />
        </h1>
        <p className="text-sm text-chalk-dim mt-1">{t('tacticsHelp')}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-chalk-dim mb-1">
            <TrendingUp size={14} />
            <span className="label">
              Your <T k="rating" />
            </span>
          </div>
          <div className="font-mono text-2xl font-extrabold">{profile.rating.rating}</div>
          <div className="text-[11px] text-chalk-faint">± {Math.round(profile.rating.rd)} deviation</div>
        </Card>
        <Card className="p-4">
          <div className="label mb-1">Progress</div>
          <div className="font-mono text-2xl font-extrabold">
            {solvedCount}
            <span className="text-chalk-faint text-base">/{PUZZLES.length}</span>
          </div>
          <div className="mt-2">
            <Progress value={solvedCount / PUZZLES.length} tone="up" />
          </div>
        </Card>
        <Link to="/rush">
          <Card className="p-4 h-full hover:border-brand/50 transition group">
            <div className="flex items-center gap-2 text-eval-warn mb-1">
              <Timer size={14} />
              <span className="label !text-eval-warn">Puzzle Rush</span>
            </div>
            <div className="font-mono text-2xl font-extrabold group-hover:text-brand-bright transition">
              {profile.rushBest}
            </div>
            <div className="text-[11px] text-chalk-faint">personal best · three lives</div>
          </Card>
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setFilter('all')}
          className={`chip border ${filter === 'all' ? 'bg-brand text-white border-brand' : 'bg-ink-850 text-chalk-dim border-ink-700'}`}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`chip border ${filter === c ? 'bg-brand text-white border-brand' : 'bg-ink-850 text-chalk-dim border-ink-700'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3 text-[11px]">
        <span className="text-chalk-faint font-bold uppercase tracking-wider">Sort</span>
        {(
          [
            ['match', 'Best match'],
            ['elo', 'Easiest first'],
            ['unsolved', 'Unsolved first'],
          ] as Array<[Sort, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSort(id)}
            className={`font-bold ${sort === id ? 'text-brand' : 'text-chalk-dim hover:text-chalk'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.map(({ puzzle, solved, odds }) => (
          <Link key={puzzle.id} to={`/train/${puzzle.id}`}>
            <Card className="p-3.5 hover:border-brand/50 transition group">
              <div className="flex items-start gap-3">
                <span
                  className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${
                    solved ? 'bg-eval-up/15 text-eval-up' : 'bg-brand/12 text-brand'
                  }`}
                >
                  {solved ? <Check size={17} /> : <Zap size={17} />}
                </span>
                <span className="grow min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14.5px] font-bold group-hover:text-brand-bright transition">{puzzle.title}</span>
                    <Chip tone="brand">{puzzle.elo}</Chip>
                    <Chip>{puzzle.category}</Chip>
                  </span>
                  <span className="block text-[12.5px] text-chalk-dim mt-1 leading-snug line-clamp-2">{puzzle.objective}</span>
                </span>
                <span className="hidden sm:block text-right shrink-0">
                  <span className="block text-[10px] uppercase tracking-wide text-chalk-faint">win odds</span>
                  <span className="block font-mono text-[13px] font-bold text-chalk-dim">{Math.round(odds * 100)}%</span>
                  <span className="block text-[10px] text-chalk-faint">{puzzle.maxMoves} moves</span>
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
