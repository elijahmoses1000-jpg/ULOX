import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { Flame, Swords, Trophy } from 'lucide-react';
import { CATEGORIES, PUZZLES } from '../lib/puzzles';
import { ROADMAPS, countNodes } from '../lib/curriculum';
import { COLOUR_CHOICES, bandFor, levelFor, useProfile } from '../lib/profile';
import { Avatar, Card, Chip, Progress, useToast } from '../components/ui';

interface LeaderRow {
  playerId: string;
  name: string;
  colour: string;
  rating: number;
  solvedCount: number;
  streak: number;
}

export function Me() {
  const profile = useProfile(s => s.profile);
  const setName = useProfile(s => s.setName);
  const setColour = useProfile(s => s.setColour);
  const push = useProfile(s => s.push);
  const synced = useProfile(s => s.synced);
  const toast = useToast();

  const [draft, setDraft] = useState(profile.name);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);

  const level = levelFor(profile.xp);
  const band = bandFor(profile.rating.rating);

  useEffect(() => {
    api
      .get('/api/leaderboard')
      .then(res => setLeaders(res.data?.players ?? []))
      .catch(() => setLeaders([]));
  }, [synced]);

  const save = async () => {
    setName(draft);
    await push();
    toast('Profile saved and published to the leaderboard.', 'ok');
  };

  const byCategory = CATEGORIES.map(c => {
    const all = PUZZLES.filter(p => p.category === c);
    const done = all.filter(p => profile.solved[p.id]).length;
    return { category: c, done, total: all.length };
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 lg:py-8 space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <Avatar name={draft || profile.name} colour={profile.colour} size={60} />
          <div className="grow min-w-0">
            <label className="label block mb-1.5" htmlFor="display-name">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                id="display-name"
                className="field"
                value={draft}
                maxLength={24}
                onChange={e => setDraft(e.target.value)}
                placeholder="Your name on the board"
              />
              <button className="btn-primary shrink-0" onClick={save} disabled={!draft.trim()}>
                Save
              </button>
            </div>
            {!draft.trim() && <p className="mt-1.5 text-[11.5px] text-eval-down">A display name is required to appear on the leaderboard.</p>}
            <div className="flex gap-1.5 mt-3">
              {COLOUR_CHOICES.map(c => (
                <button
                  key={c}
                  onClick={() => setColour(c)}
                  aria-label={`Colour ${c}`}
                  className={`w-7 h-7 rounded-lg border-2 transition ${profile.colour === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          <Metric label="Rating" value={String(profile.rating.rating)} sub={band.name} />
          <Metric label="Level" value={`L${level.level}`} sub={`${profile.xp} XP`} />
          <Metric label="Streak" value={String(profile.streak)} sub="days" icon={<Flame size={12} className="text-eval-warn" />} />
          <Metric label="Arena" value={`${profile.arena.wins}–${profile.arena.losses}`} sub="win–loss" icon={<Swords size={12} />} />
        </div>
        <div className="mt-3">
          <Progress value={level.into / level.span} />
          <p className="mt-1.5 text-[11px] text-chalk-faint">
            {level.span - level.into} XP to level {level.level + 1}
          </p>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="label mb-3">Tactics by category</div>
          <div className="space-y-2.5">
            {byCategory.map(row => (
              <div key={row.category}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-chalk-dim">{row.category}</span>
                  <span className="font-mono text-chalk-faint">
                    {row.done}/{row.total}
                  </span>
                </div>
                <Progress value={row.total ? row.done / row.total : 0} tone={row.done === row.total ? 'up' : 'brand'} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="label mb-3">Roadmap progress</div>
          <div className="space-y-2.5">
            {ROADMAPS.map(r => {
              const total = countNodes(r);
              const done = r.sections.reduce((s, sec) => s + sec.nodes.filter(n => profile.topics[n.id] === 'done').length, 0);
              return (
                <div key={r.slug}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-chalk-dim">{r.title}</span>
                    <span className="font-mono text-chalk-faint">
                      {done}/{total}
                    </span>
                  </div>
                  <Progress value={total ? done / total : 0} tone={done === total ? 'up' : 'brand'} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={15} className="text-eval-warn" />
          <span className="label">Global leaderboard</span>
          <Chip tone={synced ? 'up' : 'warn'} className="ml-auto">
            {synced ? 'synced' : 'local only'}
          </Chip>
        </div>
        {leaders.length === 0 ? (
          <p className="text-[12.5px] text-chalk-dim">No rated players yet. Save your profile to publish your rating.</p>
        ) : (
          <ol className="divide-y divide-ink-750">
            {leaders.map((row, i) => (
              <li
                key={row.playerId}
                className={`flex items-center gap-3 py-2.5 ${row.playerId === profile.playerId ? 'text-brand-bright' : ''}`}
              >
                <span className="w-5 text-[12px] font-bold text-chalk-faint tabular-nums">{i + 1}</span>
                <Avatar name={row.name} colour={row.colour || '#EE1B24'} size={28} />
                <span className="text-[13px] font-semibold truncate grow">{row.name}</span>
                <span className="text-[11px] text-chalk-faint hidden sm:block">{row.solvedCount} solved</span>
                <span className="font-mono text-[13px] font-bold">{row.rating}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value, sub, icon }: { label: string; value: string; sub: string; icon?: React.ReactNode }) {
  return (
    <div className="panel-flat p-3">
      <div className="flex items-center gap-1 label">
        {icon}
        {label}
      </div>
      <div className="font-mono text-xl font-extrabold mt-0.5">{value}</div>
      <div className="text-[11px] text-chalk-faint">{sub}</div>
    </div>
  );
}
