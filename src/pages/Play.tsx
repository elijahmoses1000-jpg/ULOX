import { Link } from 'react-router-dom';
import { Bot, Globe2, Swords, Timer, Users } from 'lucide-react';
import { useProfile } from '../lib/profile';
import { useLobby } from '../hooks/useLobby';
import { Card, Chip } from '../components/ui';

/**
 * Play.
 *
 * Four ways to play the same game, ordered by how much of other people they
 * need. Nobody should have to find an opponent before they can play, and
 * nobody who wants an opponent should have to hunt for where that lives.
 *
 * The live count is real: it comes from the same lobby presence the map uses,
 * so "3 online" means three people who could accept a challenge right now.
 */

export function Play() {
  const profile = useProfile(s => s.profile);
  const { others, connected } = useLobby('Choosing how to play');

  const best = profile.rushBest;
  const online = others.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">Play</h1>
        <p className="text-sm text-chalk-dim mt-1 max-w-2xl leading-relaxed">
          The same game every way round: a broken agent system, and the move that fixes it. Play it against the clock,
          against UX, or against people.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5 flex flex-col">
          <span className="w-10 h-10 rounded-xl bg-eval-warn/12 text-eval-warn grid place-items-center mb-3">
            <Timer size={20} />
          </span>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold">Against yourself</h2>
            {best > 0 && <Chip>best {best}</Chip>}
          </div>
          <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug grow">
            {best > 0
              ? `Three minutes, three lives, and your own ${best} to beat. Nobody else is involved — the only opponent is the run you had last time.`
              : 'Three minutes, three lives, one position after another. Your first run sets the mark everything after it is measured against.'}
          </p>
          <Link to="/rush" className="btn-primary w-full mt-4 !text-xs">
            <Timer size={14} /> {best > 0 ? 'Beat your best' : 'Set your first mark'}
          </Link>
        </Card>

        <Card className="p-5 flex flex-col">
          <span className="w-10 h-10 rounded-xl bg-brand/12 text-brand grid place-items-center mb-3">
            <Bot size={20} />
          </span>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold">Against UX</h2>
            <Chip tone="brand">always on</Chip>
          </div>
          <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug grow">
            You and UX repair identical copies of the same broken system, six moves each. It plays through the engine
            that scores you, and says why after every move — which is the part you keep.
          </p>
          <Link to="/duel" className="btn-primary w-full mt-4 !text-xs">
            <Bot size={14} /> Play UX
          </Link>
        </Card>

        <Card className="p-5 flex flex-col">
          <span className="w-10 h-10 rounded-xl bg-info/12 text-info grid place-items-center mb-3">
            <Swords size={20} />
          </span>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold">One on one</h2>
            <Chip tone="warn">rated</Chip>
          </div>
          <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug grow">
            Five positions, both players racing the same board. Send a six-character code or a link — whoever joins
            needs neither an account nor an install. Your rating moves on the result.
          </p>
          <Link to="/arena" className="btn-primary w-full mt-4 !text-xs">
            <Swords size={14} /> Start a match
          </Link>
        </Card>

        <Card className="p-5 flex flex-col">
          <span className="w-10 h-10 rounded-xl bg-eval-up/12 text-eval-up grid place-items-center mb-3">
            <Users size={20} />
          </span>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold">Two on two</h2>
            <Chip>unrated</Chip>
          </div>
          <p className="text-[12.5px] text-chalk-dim mt-1 leading-snug grow">
            Same five positions, four players, two sides. A side scores its members’ solves added together, so a
            team-mate who is still learning costs you nothing they do not also win back.
          </p>
          <Link to="/arena?mode=team" className="btn-primary w-full mt-4 !text-xs">
            <Users size={14} /> Start a team match
          </Link>
        </Card>
      </div>

      <Card className="p-4 mt-3 flex items-center gap-3 flex-wrap">
        <span className="w-9 h-9 rounded-xl bg-ink-750 text-chalk-dim grid place-items-center shrink-0">
          <Globe2 size={17} />
        </span>
        <p className="text-[12.5px] text-chalk-dim grow min-w-[200px] leading-relaxed">
          <span className="text-chalk font-semibold">
            {connected ? (online === 0 ? 'Nobody else is online' : `${online} ${online === 1 ? 'person' : 'people'} online`) : 'Connecting to the lobby'}
          </span>
          {connected && online > 0
            ? ' — challenge any of them and the match starts the moment they accept.'
            : ' — the lobby shows who is in UloX right now, on a map.'}
        </p>
        <Link to="/live" className="btn-ghost !text-xs shrink-0">
          Open the lobby
        </Link>
      </Card>
    </div>
  );
}
