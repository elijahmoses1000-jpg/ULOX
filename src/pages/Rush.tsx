import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Heart, Play, RotateCcw, Timer, X } from 'lucide-react';
import { AgentGraph, Move, applyMove, describeMove } from '../lib/agentic';
import { evaluate, generateMoves } from '../lib/engine';
import { PUZZLES, Puzzle } from '../lib/puzzles';
import { MockInjection } from '../lib/simulator';
import { useProfile } from '../lib/profile';
import { GraphCanvas } from '../components/GraphCanvas';
import { Card, Chip, useToast } from '../components/ui';

const ROUND_SECONDS = 180;
const LIVES = 3;

interface Round {
  puzzle: Puzzle;
  graph: AgentGraph;
  mocks: MockInjection[];
  options: Array<{ move: Move; label: string; value: number }>;
  bestValue: number;
}

/** Build one "find the best move" round from a puzzle position. */
function buildRound(puzzle: Puzzle): Round | null {
  const graph = puzzle.graph;
  const scored = generateMoves(graph)
    .map(move => {
      const next = applyMove(graph, move);
      if (next === graph) return null;
      return { move, label: describeMove(graph, move), value: evaluate(next, puzzle.mocks).value };
    })
    .filter((x): x is { move: Move; label: string; value: number } => !!x);

  if (scored.length < 4) return null;

  const seen = new Set<string>();
  const unique = scored.filter(s => (seen.has(s.label) ? false : (seen.add(s.label), true)));
  unique.sort((a, b) => b.value - a.value);

  const best = unique[0];
  const worse = unique.filter(o => best.value - o.value > 0.6);
  if (!worse.length) return null;

  const decoys: typeof unique = [];
  const pool = [...worse];
  while (decoys.length < 3 && pool.length) {
    decoys.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  if (decoys.length < 3) return null;

  const options = [best, ...decoys].sort(() => Math.random() - 0.5);
  return { puzzle, graph, mocks: puzzle.mocks, options, bestValue: best.value };
}

export function Rush() {
  const recordRush = useProfile(s => s.recordRush);
  const best = useProfile(s => s.profile.rushBest);
  const toast = useToast();

  const [phase, setPhase] = useState<'idle' | 'playing' | 'over'>('idle');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [round, setRound] = useState<Round | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const deck = useMemo(() => [...PUZZLES].sort((a, b) => a.elo - b.elo), []);
  const deckRef = useRef(0);

  const nextRound = useCallback(() => {
    setPicked(null);
    for (let attempts = 0; attempts < deck.length; attempts += 1) {
      const puzzle = deck[deckRef.current % deck.length];
      deckRef.current += 1;
      const built = buildRound(puzzle);
      if (built) {
        setRound(built);
        return;
      }
    }
    setRound(null);
  }, [deck]);

  const stop = useCallback(
    (finalScore: number) => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setPhase('over');
      recordRush(finalScore);
    },
    [recordRush]
  );

  const start = () => {
    deckRef.current = Math.floor(Math.random() * deck.length);
    setScore(0);
    setLives(LIVES);
    setSeconds(ROUND_SECONDS);
    setPhase('playing');
    nextRound();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          window.clearInterval(timerRef.current!);
          setScore(current => {
            stop(current);
            return current;
          });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    []
  );

  const choose = (index: number) => {
    if (!round || picked !== null) return;
    setPicked(index);
    const correct = round.options[index].value >= round.bestValue - 0.001;
    if (correct) {
      setScore(s => s + 1);
      window.setTimeout(nextRound, 620);
    } else {
      const remaining = lives - 1;
      setLives(remaining);
      toast(`Best was: ${round.options.reduce((a, b) => (b.value > a.value ? b : a)).label}`, 'err');
      window.setTimeout(() => {
        if (remaining <= 0) {
          setScore(current => {
            stop(current);
            return current;
          });
        } else {
          nextRound();
        }
      }, 1400);
    }
  };

  if (phase === 'idle' || phase === 'over') {
    return (
      <div className="max-w-lg mx-auto px-4 py-10">
        <Card className="p-6 text-center">
          <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-brand/12 text-brand mb-4">
            <Timer size={26} />
          </span>
          <h1 className="text-2xl font-extrabold">Puzzle Rush</h1>
          {phase === 'over' ? (
            <>
              <p className="text-sm text-chalk-dim mt-2">Time or lives ran out.</p>
              <div className="my-6">
                <div className="font-mono text-5xl font-extrabold text-brand">{score}</div>
                <div className="text-[12px] text-chalk-faint mt-1">
                  positions solved · personal best {Math.max(best, score)}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-chalk-dim mt-2 leading-relaxed">
              Three minutes, three lives. Each position shows a broken agent graph and four candidate moves — pick the one
              the engine rates highest.
            </p>
          )}
          <div className="flex gap-2 justify-center mt-6">
            <button className="btn-primary" onClick={start}>
              {phase === 'over' ? <RotateCcw size={15} /> : <Play size={15} />}
              {phase === 'over' ? 'Play again' : 'Start'}
            </button>
            <Link to="/train" className="btn-ghost">
              Tactics
            </Link>
          </div>
          {phase === 'idle' && best > 0 && <p className="mt-4 text-[12px] text-chalk-faint">Your best: {best}</p>}
        </Card>
      </div>
    );
  }

  const bestOption = round ? round.options.reduce((a, b) => (b.value > a.value ? b : a)) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          {Array.from({ length: LIVES }).map((_, i) => (
            <Heart key={i} size={16} className={i < lives ? 'text-brand fill-brand' : 'text-ink-600'} />
          ))}
        </div>
        <Chip tone="brand">{score} solved</Chip>
        <div className="ml-auto font-mono text-lg font-extrabold tabular-nums">
          {String(Math.floor(seconds / 60))}:{String(seconds % 60).padStart(2, '0')}
        </div>
      </div>

      {round ? (
        <>
          <Card className="overflow-hidden mb-3">
            <div className="px-3.5 py-2.5 border-b border-ink-700">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip tone="brand">{round.puzzle.elo}</Chip>
                <span className="text-[13px] font-bold">{round.puzzle.title}</span>
              </div>
              <p className="text-[12px] text-chalk-dim mt-1 leading-snug">{round.puzzle.objective}</p>
            </div>
            <GraphCanvas
              graph={round.graph}
              selection={null}
              onSelect={() => {}}
              readOnly
              height="240px"
            />
          </Card>

          <div className="grid gap-2 sm:grid-cols-2">
            {round.options.map((option, i) => {
              const isBest = option.value >= round.bestValue - 0.001;
              const revealed = picked !== null;
              const chosen = picked === i;
              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  disabled={revealed}
                  className={`text-left p-3 rounded-xl border transition
                    ${
                      revealed && isBest
                        ? 'bg-eval-up/12 border-eval-up'
                        : revealed && chosen
                          ? 'bg-eval-down/12 border-eval-down'
                          : 'bg-ink-800 border-ink-700 hover:border-brand/60'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[12.5px] font-semibold text-chalk grow leading-snug">{option.label}</span>
                    {revealed && isBest && <Check size={15} className="text-eval-up shrink-0" />}
                    {revealed && chosen && !isBest && <X size={15} className="text-eval-down shrink-0" />}
                  </div>
                  {revealed && (
                    <div className="mt-1.5 font-mono text-[11px] text-chalk-faint">
                      eval {option.value >= 0 ? '+' : ''}
                      {option.value.toFixed(1)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {picked !== null && bestOption && (
            <p className="mt-3 text-[12px] text-chalk-dim text-center">
              Best move rated {bestOption.value >= 0 ? '+' : ''}
              {bestOption.value.toFixed(1)} — {bestOption.label}
            </p>
          )}
        </>
      ) : (
        <Card className="p-8 text-center text-chalk-dim">Building the next position…</Card>
      )}
    </div>
  );
}
