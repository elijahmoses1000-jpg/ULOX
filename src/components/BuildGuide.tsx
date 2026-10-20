import { Check, Circle, Hammer, Lightbulb, MousePointerClick, Share2 } from 'lucide-react';
import { AgentGraph } from '../lib/agentic';
import { BuildTask, evaluateTask } from '../lib/build-tasks';

/**
 * The Build screen's spine.
 *
 * It shows what you are making, what is already on the canvas, and the goals —
 * with exactly one highlighted as the next thing to do. Everything above the
 * current goal is ticked and collapsed to a single line; everything below is
 * dimmed. That is deliberate: a checklist where all twelve lines shout equally
 * is the thing people were bouncing off.
 *
 * Nothing here is self-reported. Each tick is recomputed from the graph on
 * every change, so the list cannot disagree with the canvas.
 */
export function BuildGuide({
  task,
  graph,
  stageHex,
  built,
  onMarkBuilt,
  onShare,
}: {
  task: BuildTask;
  graph: AgentGraph;
  stageHex: string;
  built: boolean;
  onMarkBuilt: () => void;
  onShare?: () => void;
}) {
  const { results, next, done, total, complete } = evaluateTask(task, graph);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Hammer size={14} style={{ color: stageHex }} />
        <span className="label" style={{ color: stageHex }}>
          Your build
        </span>
        <span className="ml-auto text-[11px] font-bold font-mono" style={{ color: complete ? stageHex : undefined }}>
          {done}/{total}
        </span>
      </div>

      <h2 className="text-[14.5px] font-bold leading-snug">{task.making}</h2>
      <p className="text-[12px] text-chalk-dim mt-1.5 leading-relaxed">
        <span className="text-chalk-faint">On the canvas now: </span>
        {task.youHave}
      </p>

      <div
        className="h-1 rounded-full bg-ink-750 mt-3 overflow-hidden"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(done / total) * 100}%`, background: stageHex }}
        />
      </div>

      <ol className="mt-3.5 space-y-1.5">
        {results.map(({ goal, done: ok }, i) => {
          const isNext = next?.id === goal.id;
          return (
            <li
              key={goal.id}
              className={`rounded-lg border px-3 py-2.5 transition-all duration-200 ${
                isNext ? 'bg-ink-850' : 'border-transparent'
              }`}
              style={isNext ? { borderColor: `${stageHex}66` } : undefined}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">
                  {ok ? (
                    <Check size={14} style={{ color: stageHex }} />
                  ) : (
                    <Circle size={13} className={isNext ? '' : 'text-chalk-faint'} style={isNext ? { color: stageHex } : undefined} />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-[12.5px] leading-snug ${
                      ok ? 'text-chalk-faint line-through decoration-chalk-faint/50' : isNext ? 'text-chalk font-semibold' : 'text-chalk-dim'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-chalk-faint mr-1.5">{i + 1}.</span>
                    {goal.title}
                  </p>

                  {/* The reason — and, where the gesture is not obvious, the
                      how — appear only on the step you are actually on. */}
                  {isNext && (
                    <>
                      <p className="text-[11.5px] text-chalk-dim mt-1.5 leading-relaxed flex gap-1.5">
                        <Lightbulb size={11} className="mt-0.5 shrink-0" style={{ color: stageHex }} />
                        <span>{goal.why}</span>
                      </p>
                      {goal.how && (
                        <p className="text-[11.5px] text-chalk-dim mt-1.5 leading-relaxed flex gap-1.5">
                          <MousePointerClick size={11} className="mt-0.5 shrink-0 text-chalk-faint" />
                          <span>{goal.how}</span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4">
        {built && complete ? (
          // The moment someone has just finished something is the only moment
          // they actually want to show it to anyone.
          <div className="text-center">
            <p className="text-[12px] font-bold py-1" style={{ color: stageHex }}>
              Built ✓ — head back to the journey
            </p>
            {onShare && (
              <button className="btn-ghost w-full !text-xs mt-1.5" onClick={onShare}>
                <Share2 size={13} /> Share what you built
              </button>
            )}
          </div>
        ) : built ? (
          // Marked built before this step had goals. Grandfather it rather than
          // taking the stage back, but do not claim the goals below are met.
          <p className="text-[11.5px] text-chalk-dim text-center leading-relaxed py-1">
            <span className="font-bold" style={{ color: stageHex }}>
              Already counted as built.
            </span>{' '}
            The goals above are the current version of this step — worth a pass if you want the practice.
          </p>
        ) : complete ? (
          <button className="btn-primary w-full !text-xs animate-popIn" onClick={onMarkBuilt}>
            <Check size={13} /> All goals met — mark this step built
          </button>
        ) : (
          <p className="text-[11.5px] text-chalk-faint text-center leading-relaxed">
            {total - done} {total - done === 1 ? 'goal' : 'goals'} to go. The list ticks itself as you wire things up.
          </p>
        )}
      </div>
    </div>
  );
}
