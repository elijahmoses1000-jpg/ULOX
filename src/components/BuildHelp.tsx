import { useEffect, useState } from 'react';
import { CircleDot, Hand, Hammer, Link2, MousePointerClick, Play, Share2, Sliders } from 'lucide-react';
import { KIND_META, NodeKind } from '../lib/agentic';
import { Modal } from './ui';

const SEEN_KEY = 'ulox.buildhelp.v1';

/** Has this person already been shown the Build explainer? */
export function hasSeenBuildHelp(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // private mode: do not nag on every page load
  }
}

export function markBuildHelpSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* nothing to remember it with */
  }
}

const GESTURES: Array<{ icon: React.ReactNode; title: string; body: string }> = [
  {
    icon: <MousePointerClick size={15} />,
    title: 'Tap a box to open it',
    body: 'Agents and guards have a five-field contract — who it is, what it does, when it is finished, how it answers, what it must never do.',
  },
  {
    icon: <Link2 size={15} />,
    title: 'Tap ⊕ then tap another box to join them',
    body: 'The arrow is the flow. Tap the ⊕ handle on the first box, then tap the second.',
  },
  {
    icon: <Sliders size={15} />,
    title: 'Tap an arrow to change when it fires',
    body: '"On success" and "always" look the same until something fails. The condition is the decision.',
  },
  {
    icon: <Hand size={15} />,
    title: 'Drag to pan, scroll or pinch to zoom',
    body: 'Nothing you do to the view changes the system.',
  },
];

const PIECES: NodeKind[] = ['entry', 'agent', 'tool', 'guard', 'memory', 'terminal'];

const PIECE_HUE: Record<string, string> = {
  entry: '#71777E',
  agent: '#4EA8FF',
  tool: '#3FD07A',
  guard: '#F5A524',
  memory: '#B57BFF',
  condition: '#9B7BFF',
  terminal: '#EE1B24',
};

/**
 * What Build is and how to drive it.
 *
 * Opens itself the first time someone lands on Build and never again, and is
 * reachable from the header after that. The old guidance was four bullet
 * points buried inside the Edit tab — which only helps someone who already
 * worked out that the Edit tab exists.
 */
export function BuildHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How to use Build"
      wide
      footer={
        <button className="btn-primary !text-xs" onClick={onClose}>
          Got it
        </button>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-chalk">
        Build is where you draw an AI agent as a diagram and run it. Boxes are steps. Arrows are what happens next.
        Nothing here calls a real model — a simulator runs your diagram so you can see exactly where it breaks.
      </p>

      <div className="label mt-5 mb-2">What is on screen</div>
      <ol className="space-y-2">
        {[
          ['The canvas', 'Your agent. Drag the boxes around; wire them together.'],
          ['Your build', 'The goals for this step. They tick themselves as you wire things up.'],
          ['Health score', 'One number for how sound the system is, plus every problem it found and the fix.'],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-2.5">
            <span className="w-5 h-5 rounded-full bg-ink-750 text-[11px] font-bold grid place-items-center shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-[12.5px] leading-relaxed">
              <span className="font-bold text-chalk">{title}</span>
              <span className="text-chalk-dim"> — {body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="label mt-5 mb-2">The four things you can do</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {GESTURES.map(g => (
          <div key={g.title} className="panel-flat p-3">
            <div className="flex items-center gap-2 text-brand-bright">
              {g.icon}
              <span className="text-[12.5px] font-bold text-chalk">{g.title}</span>
            </div>
            <p className="text-[11.5px] text-chalk-dim mt-1.5 leading-relaxed">{g.body}</p>
          </div>
        ))}
      </div>

      <div className="label mt-5 mb-2">The pieces</div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {PIECES.map(kind => (
          <div key={kind} className="flex items-start gap-2 panel-flat px-3 py-2">
            <CircleDot size={11} className="mt-1 shrink-0" style={{ color: PIECE_HUE[kind] }} />
            <span className="text-[11.5px] leading-relaxed min-w-0">
              <span className="font-bold text-chalk">{KIND_META[kind].label}</span>
              <span className="text-chalk-dim"> — {KIND_META[kind].hint}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="label mt-5 mb-2">How you know it works</div>
      <ul className="space-y-1.5">
        {[
          [<Play key="p" size={13} />, 'Press Run. The simulator walks your diagram step by step and shows what each one did.'],
          [<Hammer key="h" size={13} />, 'Work down the goals in Your build. When all of them tick, the step counts as built.'],
          [<Share2 key="s" size={13} />, 'Share build publishes it — a link anyone can open and run, a card for posting, and a video of the run.'],
        ].map(([icon, text], i) => (
          <li key={i} className="flex gap-2.5 items-start">
            <span className="text-brand-bright mt-0.5 shrink-0">{icon}</span>
            <span className="text-[12.5px] text-chalk-dim leading-relaxed">{text}</span>
          </li>
        ))}
      </ul>

      <p className="text-[11.5px] text-chalk-faint mt-5 leading-relaxed">
        Nothing you do here can break anything. Every change is a reversible move — undo and redo live in
        <span className="text-chalk-dim font-semibold"> Your changes</span>.
      </p>
    </Modal>
  );
}

/** Opens the explainer once, the first time someone reaches Build. */
export function useFirstRunHelp(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!hasSeenBuildHelp()) {
      setOpen(true);
      markBuildHelpSeen();
    }
  }, []);
  return [open, setOpen];
}
