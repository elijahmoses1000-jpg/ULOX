import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Check, Flag, RotateCcw, Trophy, User } from 'lucide-react';
import { AgentGraph, Move, applyMove, cloneGraph, describeMove } from '../lib/agentic';
import { Position, evaluate, generateMoves, gradeMove, GRADE_META } from '../lib/engine';
import { PUZZLES } from '../lib/puzzles';
import { MockInjection } from '../lib/simulator';
import { UX_LEVELS, UxLevel, UxTurn, uxOnYourMove, uxTurn } from '../lib/ux';
import { useProfile } from '../lib/profile';
import { GraphCanvas } from '../components/GraphCanvas';
import { Card, Chip, Tabs, useToast } from '../components/ui';

/**
 * You versus UX.
 *
 * Both sides get an identical broken system and the same number of moves to
 * repair it. Nobody edits the other's board, so there is no blocking, no
 * tempo tricks and no way to win by making the position confusing — the only
 * question is whose architecture is sounder when the moves run out.
 *
 * UX plays through the same engine that scores you, and says why after every
 * move. That is the point of playing it at all: a bot you cannot learn from
 * is just a timer.
 */

const ROUNDS = 6;
/** Positions with enough wrong with them to support six repairs each. */
const OPENERS = PUZZLES.filter(p => p.graph.nodes.length >= 4).slice(0, 12);

interface Option {
  move: Move;
  label: string;
  value: number;
}

/**
 * Four candidate moves: the best one the engine sees, and three spread across
 * the rest of the range so the choice is a real judgement rather than one
 * plausible move beside three absurdities.
 */
function optionsFor(graph: AgentGraph, mocks: MockInjection[], seed: number): Option[] {
  const seen = new Set<string>();
  const scored = generateMoves(graph)
    .map(move => {
      const next = applyMove(graph, move);
      if (next === graph) return null;
      const label = describeMove(graph, move);
      if (seen.has(label)) return null;
      seen.add(label);
      return { move, label, value: evaluate(next, mocks).value };
    })
    .filter((x): x is Option => !!x)
    .sort((a, b) => b.value - a.value);

  if (scored.length <= 4) return scored;

  const chosen = [scored[0]];
  const rest = scored.slice(1);
  for (const fraction of [0.18, 0.45, 0.8]) {
    const index = Math.min(rest.length - 1, Math.floor(rest.length * fraction));
    const candidate = rest[index];
    if (candidate && !chosen.includes(candidate)) chosen.push(candidate);
  }
  while (chosen.length < 4 && rest.length) {
    const candidate = rest[(seed + chosen.length * 3) % rest.length];
    if (!chosen.includes(candidate)) chosen.push(candidate);
    else break;
  }

  // Rotate rather than shuffle: the best move must not always sit first, and a
  // rotation keeps the order stable for a given round so a re-render cannot
  // move a button out from under a finger mid-tap.
  const offset = seed % chosen.length;
  return [...chosen.slice(offset), ...chosen.slice(0, offset)];
}

interface Played {
  round: number;
  yours: { label: string; note: string; grade: ReturnType<typeof gradeMove> };
  theirs: { label: string; reason: string } | null;
}

export function Duel() {
  const toast = useToast();
  const recordDuel = useProfile(s => s.recordDuel);
  const [level, setLevel] = useState<UxLevel>('steady');
  const [openerIndex, setOpenerIndex] = useState(0);

  const opener = OPENERS[openerIndex % OPENERS.length];
  const mocks = opener.mocks;

  const [mine, setMine] = useState<AgentGraph>(() => cloneGraph(opener.graph));
  const [theirs, setTheirs] = useState<AgentGraph>(() => cloneGraph(opener.graph));
  const [round, setRound] = useState(0);
  const [log, setLog] = useState<Played[]>([]);
  const [settled, setSettled] = useState(false);
  const [uxLast, setUxLast] = useState<Move | null>(null);
  const [board, setBoard] = useState<'mine' | 'theirs'>('mine');

  const reset = useCallback(
    (nextOpener = openerIndex) => {
      const puzzle = OPENERS[nextOpener % OPENERS.length];
      setMine(cloneGraph(puzzle.graph));
      setTheirs(cloneGraph(puzzle.graph));
      setRound(0);
      setLog([]);
      setSettled(false);
      setUxLast(null);
      setBoard('mine');
    },
    [openerIndex]
  );

  const myPosition: Position = useMemo(() => evaluate(mine, mocks), [mine, mocks]);
  const theirPosition: Position = useMemo(() => evaluate(theirs, mocks), [theirs, mocks]);
  const options = useMemo(
    () => (round < ROUNDS ? optionsFor(mine, mocks, round + openerIndex) : []),
    [mine, mocks, round, openerIndex]
  );

  const over = round >= ROUNDS || (!options.length && round > 0);
  const myScore = myPosition.report.score;
  const theirScore = theirPosition.report.score;
  const result = myScore > theirScore + 0.05 ? 'win' : myScore < theirScore - 0.05 ? 'loss' : 'draw';

  // Settle once, in an effect: calling a store action while rendering would
  // write to another component's state mid-render.
  useEffect(() => {
    if (!over || settled) return;
    setSettled(true);
    recordDuel(result);
  }, [over, settled, result, recordDuel]);

  const playOption = (option: Option) => {
    if (over) return;

    const before = myPosition;
    const nextMine = applyMove(mine, option.move);
    const after = evaluate(nextMine, mocks);
    const bestValue = options.reduce((m, o) => Math.max(m, o.value), before.value);
    const grade = gradeMove(before.value, after.value, bestValue);
    const note = uxOnYourMove(before, after, bestValue);

    // UX answers on its own board, from its own position.
    const turn: UxTurn = uxTurn(theirs, mocks, level, uxLast);
    const nextTheirs = turn.move ? applyMove(theirs, turn.move) : theirs;

    setMine(nextMine);
    setTheirs(nextTheirs);
    setUxLast(turn.move);
    setLog(entries => [
      {
        round: round + 1,
        yours: { label: option.label, note, grade },
        theirs: turn.move ? { label: turn.description, reason: turn.reason } : null,
      },
      ...entries,
    ]);
    setRound(r => r + 1);
  };

  const next = () => {
    const n = (openerIndex + 1) % OPENERS.length;
    setOpenerIndex(n);
    reset(n);
    toast('New position. Same rules.', 'info');
  };

  const shown = board === 'mine' ? mine : theirs;
  const shownIssues = (board === 'mine' ? myPosition : theirPosition).report.issues;

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 lg:py-8">
      <header className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Bot size={18} className="text-brand" />
          <h1 className="font-display text-2xl font-bold tracking-tight">Play UX</h1>
        </div>
        <p className="text-sm text-chalk-dim max-w-2xl leading-relaxed">
          You and UX each get the same broken system and {ROUNDS} moves to repair it. Separate boards — the only thing
          that decides it is whose architecture scores higher at the end. UX says why after every move it makes.
        </p>
      </header>

      <Card className="p-3 mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="label mb-1.5">How hard UX plays</div>
            <div className="flex gap-1.5 flex-wrap">
              {UX_LEVELS.map(l => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLevel(l.id);
                    reset();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border transition ${
                    level === l.id
                      ? 'bg-brand text-white border-brand'
                      : 'bg-ink-850 text-chalk-dim border-ink-700 hover:border-ink-500 hover:text-chalk'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[11.5px] text-chalk-faint max-w-[260px] leading-relaxed">
            {UX_LEVELS.find(l => l.id === level)?.blurb}
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <Card className={`p-3 ${over && result === 'win' ? 'border-eval-up/60' : ''}`}>
          <div className="flex items-center gap-2">
            <User size={14} className="text-chalk-dim" />
            <span className="text-[12px] font-bold text-chalk grow">You</span>
            <span
              className="font-display text-xl font-bold tabular-nums"
              style={{ color: myScore >= 0 ? '#3FD07A' : '#EE1B24' }}
            >
              {myScore >= 0 ? '+' : ''}
              {myScore.toFixed(1)}
            </span>
          </div>
        </Card>
        <Card className={`p-3 ${over && result === 'loss' ? 'border-eval-down/60' : ''}`}>
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-brand" />
            <span className="text-[12px] font-bold text-chalk grow">UX · {UX_LEVELS.find(l => l.id === level)?.label}</span>
            <span
              className="font-display text-xl font-bold tabular-nums"
              style={{ color: theirScore >= 0 ? '#3FD07A' : '#EE1B24' }}
            >
              {theirScore >= 0 ? '+' : ''}
              {theirScore.toFixed(1)}
            </span>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden mb-3">
        <div className="p-2 border-b border-ink-700">
          <Tabs<'mine' | 'theirs'>
            active={board}
            onChange={setBoard}
            className="!bg-transparent !border-0 !p-0"
            tabs={[
              { id: 'mine', label: 'Your board' },
              { id: 'theirs', label: 'UX’s board' },
            ]}
          />
        </div>
        <div className="h-[260px]">
          <GraphCanvas graph={shown} issues={shownIssues} readOnly selection={null} onSelect={() => {}} />
        </div>
      </Card>

      {over ? (
        <Card className="p-4 mb-3 text-center">
          <Trophy size={22} className="mx-auto mb-2" style={{ color: result === 'win' ? '#3FD07A' : '#71777E' }} />
          <h2 className="font-display text-lg font-bold">
            {result === 'win' ? 'You win' : result === 'loss' ? 'UX wins' : 'Drawn'}
          </h2>
          <p className="text-[12.5px] text-chalk-dim mt-1.5 leading-relaxed max-w-md mx-auto">
            {result === 'win'
              ? `Your system scores ${myScore.toFixed(1)} against ${theirScore.toFixed(1)}. Take the same position again at a harder level.`
              : result === 'loss'
                ? `UX finished on ${theirScore.toFixed(1)} to your ${myScore.toFixed(1)}. Its reasons are in the log below — the gap is usually one fault it closed and you did not.`
                : `Both systems finished on ${myScore.toFixed(1)}. A draw against UX is a sound repair.`}
          </p>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <button className="btn-primary !text-xs" onClick={next}>
              <Flag size={13} /> New position
            </button>
            <button className="btn-ghost !text-xs" onClick={() => reset()}>
              <RotateCcw size={13} /> Replay this one
            </button>
            <Link to="/play" className="btn-quiet !text-xs">
              Back to Play
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-4 mb-3">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="label">Your move</span>
            <span className="ml-auto text-[11px] font-mono text-chalk-faint">
              {round + 1} of {ROUNDS}
            </span>
          </div>
          <p className="text-[12px] text-chalk-dim mb-2.5 leading-relaxed">{opener.objective}</p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {options.map(option => (
              <button
                key={option.label}
                onClick={() => playOption(option)}
                className="panel-flat px-3 py-2.5 text-left hover:border-brand/60 transition text-[12.5px] text-chalk"
              >
                {option.label}
              </button>
            ))}
          </div>
          {!options.length && (
            <p className="text-[12px] text-chalk-faint leading-relaxed">
              Nothing left that improves your board — that is a finished repair. The result stands as it is.
            </p>
          )}
        </Card>
      )}

      {log.length > 0 && (
        <>
          <div className="label mb-2">Move log</div>
          <div className="space-y-2">
            {log.map(entry => (
              <Card key={entry.round} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10.5px] font-mono text-chalk-faint">#{entry.round}</span>
                  <Chip tone={entry.yours.grade === 'blunder' || entry.yours.grade === 'mistake' ? 'warn' : 'brand'}>
                    {GRADE_META[entry.yours.grade].label}
                  </Chip>
                </div>
                <div className="flex items-start gap-2.5">
                  <User size={13} className="text-chalk-faint mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-chalk font-semibold">{entry.yours.label}</p>
                    <p className="text-[11.5px] text-chalk-dim mt-0.5 leading-relaxed">{entry.yours.note}</p>
                  </div>
                </div>
                {entry.theirs ? (
                  <div className="flex items-start gap-2.5 mt-2.5 pt-2.5 border-t border-ink-700">
                    <Bot size={13} className="text-brand mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-chalk font-semibold">{entry.theirs.label}</p>
                      <p className="text-[11.5px] text-chalk-dim mt-0.5 leading-relaxed">{entry.theirs.reason}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 mt-2.5 pt-2.5 border-t border-ink-700">
                    <Check size={13} className="text-eval-up mt-0.5 shrink-0" />
                    <p className="text-[11.5px] text-chalk-dim leading-relaxed">
                      UX found nothing left to improve on its board and passed.
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
