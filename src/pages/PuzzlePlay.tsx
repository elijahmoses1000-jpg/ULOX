import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronLeft, GraduationCap, Target, X } from 'lucide-react';
import { PUZZLES, PUZZLE_BY_ID, Verdict, checkSolved } from '../lib/puzzles';
import { Position } from '../lib/engine';
import { TOPIC_BY_ID, topicRoadmap } from '../lib/curriculum';
import { stageForDrill } from '../lib/journey';
import { useProfile } from '../lib/profile';
import { useLab } from '../lib/store';
import { Workbench } from '../components/Workbench';
import { Chip, Modal, useToast } from '../components/ui';

export function PuzzlePlay() {
  const { puzzleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const puzzle = puzzleId ? PUZZLE_BY_ID.get(puzzleId) : undefined;
  const load = useLab(s => s.load);
  const movesUsed = useLab(s => s.movesUsed);
  const ledger = useLab(s => s.ledger);
  const reviewIndex = useLab(s => s.reviewIndex);
  const recordSolve = useProfile(s => s.recordSolve);
  const solvedBefore = useProfile(s => (puzzleId ? s.profile.solved[puzzleId] : undefined));

  const [hints, setHints] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [done, setDone] = useState(false);
  const [delta, setDelta] = useState(0);
  const [failOpen, setFailOpen] = useState(false);
  const startRef = useRef(Date.now());
  const settledRef = useRef(false);

  useEffect(() => {
    if (!puzzle) return;
    load(puzzle.graph, puzzle.mocks, puzzle);
    setHints(0);
    setVerdict(null);
    setDone(false);
    setDelta(0);
    setFailOpen(false);
    startRef.current = Date.now();
    settledRef.current = false;
  }, [puzzle, load]);

  const next = useMemo(() => {
    if (!puzzle) return null;
    const sorted = [...PUZZLES].sort((a, b) => a.elo - b.elo);
    const idx = sorted.findIndex(p => p.id === puzzle.id);
    return sorted[idx + 1] ?? sorted[0];
  }, [puzzle]);

  const onPosition = useCallback(
    (position: Position) => {
      if (!puzzle || settledRef.current || reviewIndex !== null) return;
      const graph = useLab.getState().graph;
      const result = checkSolved(puzzle, graph, position.report, position.sim);
      setVerdict(result);

      const used = movesUsed();
      if (result.solved && used > 0) {
        settledRef.current = true;
        const seconds = Math.round((Date.now() - startRef.current) / 1000);
        const gained = recordSolve(puzzle.id, { moves: used, seconds, hintsUsed: hints, success: true });
        setDelta(gained);
        setDone(true);
      } else if (!result.solved && used >= puzzle.maxMoves) {
        settledRef.current = true;
        recordSolve(puzzle.id, {
          moves: used,
          seconds: Math.round((Date.now() - startRef.current) / 1000),
          hintsUsed: hints,
          success: false,
        });
        setFailOpen(true);
      }
    },
    [puzzle, hints, movesUsed, recordSolve, reviewIndex]
  );

  if (!puzzle) {
    return (
      <div className="p-8 text-center">
        <p className="text-chalk-dim">That tactic does not exist.</p>
        <Link to="/train" className="btn-primary mt-4">
          Back to tactics
        </Link>
      </div>
    );
  }

  const topic = puzzle.topics[0] ? TOPIC_BY_ID.get(puzzle.topics[0]) : undefined;
  const topicMap = puzzle.topics[0] ? topicRoadmap(puzzle.topics[0]) : undefined;
  const stage = stageForDrill(puzzle.id);
  const used = ledger.filter(e => e.scoring).length;

  const brief = (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Chip tone="brand">{puzzle.elo}</Chip>
        <Chip>{puzzle.category}</Chip>
        {solvedBefore && <Chip tone="up">solved before</Chip>}
      </div>
      {stage && (
        <Link
          to={`/journey/${stage.id}`}
          className="flex items-center gap-1.5 mb-2 text-[11px] font-bold hover:underline"
          style={{ color: stage.hex }}
        >
          <span
            className="w-4 h-4 rounded grid place-items-center text-[9px] font-extrabold"
            style={{ background: `${stage.hex}26` }}
          >
            {stage.n}
          </span>
          Step {stage.n} · {stage.formal}
        </Link>
      )}
      <h2 className="text-[15px] font-bold mb-1.5">{puzzle.title}</h2>
      <p className="text-[13px] leading-relaxed text-chalk-dim">{puzzle.objective}</p>

      <div className="label mt-4 mb-1.5">Success criteria</div>
      <div className="space-y-1">
        {(verdict?.passed ?? []).map(p => (
          <div key={p} className="flex items-start gap-1.5 text-[12px] text-eval-up">
            <Check size={13} className="shrink-0 mt-0.5" /> {p}
          </div>
        ))}
        {(verdict?.reasons ?? []).map(r => (
          <div key={r} className="flex items-start gap-1.5 text-[12px] text-chalk-dim">
            <X size={13} className="shrink-0 mt-0.5 text-eval-down" /> {r}
          </div>
        ))}
        {!verdict && <p className="text-[12px] text-chalk-faint">Make a move to see how you are scoring.</p>}
      </div>

      {hints > 0 && (
        <>
          <div className="label mt-4 mb-1.5">Hints used ({hints})</div>
          <ol className="space-y-1.5">
            {puzzle.hints.slice(0, hints).map((h, i) => (
              <li key={i} className="text-[12px] leading-snug text-chalk-dim flex gap-1.5">
                <span className="font-mono text-chalk-faint">{i + 1}.</span> {h}
              </li>
            ))}
          </ol>
        </>
      )}

      {topic && topicMap && (
        <Link
          to={`/learn/${topicMap.slug}?topic=${topic.id}`}
          className="mt-4 flex items-center gap-2 text-[12px] font-bold text-brand hover:text-brand-bright"
        >
          <GraduationCap size={13} /> Theory: {topic.title}
        </Link>
      )}
    </div>
  );

  const header = (
    <div className="px-3 pt-3 pb-2 flex items-center gap-2">
      <Link to="/train" className="btn-quiet !px-2 !py-1.5">
        <ChevronLeft size={16} />
      </Link>
      <div className="min-w-0 grow">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-brand shrink-0" />
          <h1 className="text-[14px] font-extrabold truncate">{puzzle.title}</h1>
        </div>
        <p className="text-[11px] text-chalk-faint truncate xl:hidden">{puzzle.objective}</p>
      </div>
      <Chip tone={used >= puzzle.maxMoves ? 'down' : 'brand'}>
        {used}/{puzzle.maxMoves} moves
      </Chip>
    </div>
  );

  return (
    <>
      <Workbench
        header={header}
        brief={brief}
        onPositionChange={onPosition}
        hintsUsed={hints}
        onHint={() => {
          setHints(h => {
            const next = Math.min(puzzle.hints.length, h + 1);
            if (next > h) toast(puzzle.hints[next - 1], 'info');
            return next;
          });
        }}
      />

      <Modal
        open={done}
        onClose={() => setDone(false)}
        title={
          <span className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-eval-up/15 grid place-items-center">
              <Check size={16} className="text-eval-up" />
            </span>
            Solved
          </span>
        }
        footer={
          <>
            <button className="btn-ghost !text-xs" onClick={() => setDone(false)}>
              Keep exploring
            </button>
            {next && (
              <button className="btn-primary !text-xs" onClick={() => navigate(`/train/${next.id}`)}>
                Next tactic <ArrowRight size={13} />
              </button>
            )}
          </>
        }
      >
        <div className="flex items-center gap-3 mb-4">
          <Chip tone={delta >= 0 ? 'up' : 'down'}>
            {delta >= 0 ? '+' : ''}
            {delta} rating
          </Chip>
          <Chip>
            {used} of {puzzle.maxMoves} moves
          </Chip>
          {hints > 0 && <Chip tone="warn">{hints} hint{hints > 1 ? 's' : ''}</Chip>}
        </div>
        <div className="label mb-1.5">What this tactic teaches</div>
        <p className="text-[13.5px] leading-relaxed text-chalk">{puzzle.lesson}</p>
      </Modal>

      <Modal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        title="Out of moves"
        footer={
          <>
            <button
              className="btn-ghost !text-xs"
              onClick={() => {
                useLab.getState().reset();
                settledRef.current = false;
                startRef.current = Date.now();
                setFailOpen(false);
              }}
            >
              Retry from the start
            </button>
            <button
              className="btn-primary !text-xs"
              onClick={() => {
                setHints(puzzle.hints.length);
                setFailOpen(false);
              }}
            >
              Show the full solution
            </button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-chalk mb-3">
          You used all {puzzle.maxMoves} moves without meeting the criteria. That is fine — reset the position and try the
          idea again, or read the hints and play it through.
        </p>
        <div className="space-y-1">
          {(verdict?.reasons ?? []).map(r => (
            <div key={r} className="flex items-start gap-1.5 text-[12.5px] text-chalk-dim">
              <X size={13} className="shrink-0 mt-0.5 text-eval-down" /> {r}
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
