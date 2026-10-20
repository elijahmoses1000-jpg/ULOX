import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { Check, Copy, Crown, Loader2, Radio, Swords, X } from 'lucide-react';
import { AgentGraph, Move, applyMove, describeMove } from '../lib/agentic';
import { evaluate, generateMoves } from '../lib/engine';
import { PUZZLE_BY_ID, Puzzle } from '../lib/puzzles';
import { useProfile } from '../lib/profile';
import { useRoom } from '../hooks/useRoom';
import { GraphCanvas } from '../components/GraphCanvas';
import { MatchChat } from '../components/MatchChat';
import { Avatar, Card, Chip, Progress, useToast } from '../components/ui';

interface Option {
  move: Move;
  label: string;
  value: number;
}

function buildOptions(puzzle: Puzzle): { graph: AgentGraph; options: Option[]; bestValue: number } | null {
  const graph = puzzle.graph;
  const scored = generateMoves(graph)
    .map(move => {
      const next = applyMove(graph, move);
      if (next === graph) return null;
      return { move, label: describeMove(graph, move), value: evaluate(next, puzzle.mocks).value };
    })
    .filter((x): x is Option => !!x);

  const seen = new Set<string>();
  const unique = scored.filter(s => (seen.has(s.label) ? false : (seen.add(s.label), true)));
  unique.sort((a, b) => b.value - a.value);
  if (unique.length < 4) return null;

  const best = unique[0];
  const worse = unique.filter(o => best.value - o.value > 0.6);
  if (worse.length < 3) return null;

  // Deterministic decoys keep both players on the same board.
  const decoys = [worse[0], worse[Math.floor(worse.length / 2)], worse[worse.length - 1]];
  const options = [best, ...decoys];
  return { graph, options, bestValue: best.value };
}

export function Room() {
  const { roomId } = useParams();
  const profile = useProfile(s => s.profile);
  const recordArena = useProfile(s => s.recordArena);
  const toast = useToast();
  const { room, error, connected } = useRoom(roomId);

  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const settledRef = useRef(false);

  const me = room?.players.find(p => p.playerId === profile.playerId) ?? null;
  const opponent = room?.players.find(p => p.playerId !== profile.playerId) ?? null;

  const currentPuzzle = useMemo(() => {
    if (!room || !me) return null;
    const id = room.puzzleIds[me.index];
    return id ? PUZZLE_BY_ID.get(id) ?? null : null;
  }, [room, me]);

  const board = useMemo(() => (currentPuzzle ? buildOptions(currentPuzzle) : null), [currentPuzzle]);

  useEffect(() => {
    setPicked(null);
  }, [me?.index]);

  // Rate the match once, when it settles.
  useEffect(() => {
    if (!room || room.status !== 'finished' || settledRef.current || !me || !opponent) return;
    settledRef.current = true;
    const result = room.winnerId === null ? 'draw' : room.winnerId === profile.playerId ? 'win' : 'loss';
    recordArena(result, opponent.rating || 1200);
    toast(result === 'win' ? 'Match won — rating updated.' : result === 'draw' ? 'Match drawn.' : 'Match lost — rating updated.', result === 'win' ? 'ok' : 'info');
  }, [room, me, opponent, profile.playerId, recordArena, toast]);

  const submit = useCallback(
    async (index: number) => {
      if (!room || !me || !board || picked !== null) return;
      setPicked(index);
      const correct = board.options[index].value >= board.bestValue - 0.001;
      setSubmitting(true);
      window.setTimeout(async () => {
        try {
          await api.post(`/api/rooms/${room.id}/progress`, { playerId: profile.playerId, correct });
        } catch {
          toast('Could not send that answer. Check your connection.', 'err');
        } finally {
          setSubmitting(false);
        }
      }, 700);
    },
    [room, me, board, picked, profile.playerId, toast]
  );

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      toast('Match code copied', 'ok');
    } catch {
      toast(room.code, 'info');
    }
  };

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-chalk-dim">{error}</p>
        <Link to="/arena" className="btn-primary mt-4">
          Back to the Arena
        </Link>
      </div>
    );
  }

  if (!room || !me) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-chalk-dim">
        <Loader2 size={22} className="animate-spin mx-auto mb-3" />
        Loading match…
      </div>
    );
  }

  const total = room.puzzleIds.length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 lg:py-6">
      <div className="flex items-center gap-2 mb-3">
        <Swords size={16} className="text-brand" />
        <h1 className="text-[16px] font-extrabold">Match {room.code}</h1>
        <button className="btn-quiet !px-2 !py-1" onClick={copyCode} aria-label="Copy match code">
          <Copy size={13} />
        </button>
        <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-chalk-faint">
          <Radio size={12} className={connected ? 'text-eval-up' : 'text-eval-warn'} />
          {connected ? 'live' : 'connecting'}
        </span>
      </div>

      <Card className="p-4 mb-3">
        <div className="grid grid-cols-2 gap-3">
          {[me, opponent].map((player, i) =>
            player ? (
              <div key={player.playerId} className={i === 0 ? '' : 'text-right'}>
                <div className={`flex items-center gap-2 ${i === 1 ? 'flex-row-reverse' : ''}`}>
                  <Avatar name={player.name} colour={player.colour} size={30} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold truncate">
                      {player.playerId === profile.playerId ? 'You' : player.name}
                    </span>
                    <span className="block text-[11px] text-chalk-faint">{player.rating}</span>
                  </span>
                  {room.winnerId === player.playerId && <Crown size={15} className="text-eval-warn" />}
                </div>
                <div className="mt-2">
                  <Progress value={player.index / total} tone={i === 0 ? 'brand' : 'info'} />
                  <div className={`mt-1 text-[11px] text-chalk-faint ${i === 1 ? 'text-right' : ''}`}>
                    {player.correct} correct · {Math.min(player.index, total)}/{total}
                  </div>
                </div>
              </div>
            ) : (
              <div key="empty" className="text-right">
                <div className="flex items-center gap-2 flex-row-reverse">
                  <span className="w-[30px] h-[30px] rounded-lg bg-ink-700 grid place-items-center text-chalk-faint text-xs">?</span>
                  <span className="text-[13px] font-bold text-chalk-faint">Waiting…</span>
                </div>
                <p className="mt-2 text-[11px] text-chalk-faint">Share code {room.code} to start.</p>
              </div>
            )
          )}
        </div>
      </Card>

      {room.status === 'waiting' && (
        <Card className="p-6 text-center">
          <Loader2 size={20} className="animate-spin mx-auto mb-3 text-brand" />
          <p className="text-[14px] font-bold">Waiting for an opponent</p>
          <p className="text-[12.5px] text-chalk-dim mt-1">
            Give them the code <span className="font-mono font-bold text-chalk">{room.code}</span> — the match starts the
            moment they join.
          </p>
        </Card>
      )}

      {room.status === 'finished' && (
        <Card className="p-6 text-center">
          <div className="text-3xl font-extrabold mb-1">
            {room.winnerId === null ? 'Draw' : room.winnerId === profile.playerId ? 'You win' : 'You lose'}
          </div>
          <p className="text-[13px] text-chalk-dim">
            {me.correct} correct against {opponent?.correct ?? 0}.
          </p>
          <div className="flex gap-2 justify-center mt-5">
            <Link to="/arena" className="btn-primary">
              New match
            </Link>
            <Link to="/train" className="btn-ghost">
              Back to tactics
            </Link>
          </div>
        </Card>
      )}

      {room.status === 'playing' && me.index >= total && (
        <Card className="p-6 text-center">
          <Check size={22} className="mx-auto text-eval-up mb-2" />
          <p className="text-[14px] font-bold">You have finished all {total} positions</p>
          <p className="text-[12.5px] text-chalk-dim mt-1">Waiting for your opponent to catch up…</p>
        </Card>
      )}

      {room.status === 'playing' && me.index < total && currentPuzzle && board && (
        <>
          <Card className="overflow-hidden mb-3">
            <div className="px-3.5 py-2.5 border-b border-ink-700">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip tone="brand">
                  {me.index + 1}/{total}
                </Chip>
                <span className="text-[13px] font-bold">{currentPuzzle.title}</span>
              </div>
              <p className="text-[12px] text-chalk-dim mt-1 leading-snug">{currentPuzzle.objective}</p>
            </div>
            <GraphCanvas graph={board.graph} selection={null} onSelect={() => {}} readOnly height="230px" />
          </Card>

          <div className="grid gap-2 sm:grid-cols-2">
            {board.options.map((option, i) => {
              const isBest = option.value >= board.bestValue - 0.001;
              const revealed = picked !== null;
              const chosen = picked === i;
              return (
                <button
                  key={i}
                  onClick={() => submit(i)}
                  disabled={revealed || submitting}
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
                </button>
              );
            })}
          </div>
        </>
      )}

      <MatchChat
        roomId={room.id}
        messages={room.chat ?? []}
        myPlayerId={profile.playerId}
        canChat={!!me}
      />
    </div>
  );
}
