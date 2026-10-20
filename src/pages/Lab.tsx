import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { BookOpen, Bot, ChevronLeft, Hammer, MessageSquareText, Plug, X } from 'lucide-react';
import { AgentGraph } from '../lib/agentic';
import { MockInjection } from '../lib/simulator';
import { PATTERNS, PATTERN_BY_ID, presetGraph } from '../lib/patterns';
import { useLab } from '../lib/store';
import { LAB_TOOL_KEY } from './Toolkit';
import { STAGE_BY_ID, markBuilt, readBuilt } from '../lib/journey';
import { BUILD_TASK_BY_STAGE, evaluateTask } from '../lib/build-tasks';
import { BuildGuide } from '../components/BuildGuide';
import { Workbench } from '../components/Workbench';
import { Chip, Modal, useToast } from '../components/ui';

const LAB_FACTS = [
  'Superconducting qubits currently lead on gate fidelity.',
  'Trapped-ion systems win on coherence time.',
  'Error-corrected logical qubits were demonstrated at scale in 2024.',
  'Photonic approaches scale best at room temperature.',
];

/**
 * Every tool in the loaded pattern gets a sequence of distinct successful
 * responses, so the loop can actually accumulate facts and converge instead of
 * spinning on the same one.
 */
function mocksFor(graph: AgentGraph): MockInjection[] {
  return graph.nodes
    .filter(node => node.kind === 'tool')
    .flatMap(node => LAB_FACTS.map(data => ({ nodeId: node.id, status: 200, data })));
}

export function Lab() {
  const { preset } = useParams();
  const [params] = useSearchParams();
  // Arriving from a journey step means the build can be ticked off right here,
  // instead of making someone navigate back to find the checkbox.
  const stage = STAGE_BY_ID.get((params.get('stage') ?? '') as never);
  const [stageBuilt, setStageBuilt] = useState(() => (stage ? !!readBuilt()[stage.id] : false));
  const load = useLab(s => s.load);
  const graph = useLab(s => s.graph);
  const toast = useToast();

  const dispatch = useLab(s => s.dispatch);
  const [pendingTool, setPendingTool] = useState<{ name: string; url: string; note: string; meta: string } | null>(null);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [mentorText, setMentorText] = useState('');
  const [mentorLoading, setMentorLoading] = useState(false);
  const pattern = PATTERN_BY_ID.get(preset ?? 'react');
  // Arriving from a journey step loads the *task* — the pattern with the pieces
  // that step teaches removed — rather than the finished answer.
  const task = stage ? BUILD_TASK_BY_STAGE.get(stage.id) ?? null : null;

  useEffect(() => {
    const next = task ? task.startGraph() : presetGraph(preset);
    load(next, mocksFor(next), null);
  }, [preset, load, task]);

  // An API chosen in the Toolkit waits here until it is actually wanted —
  // dropping a node into someone's diagram uninvited would be rude.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_TOOL_KEY);
      if (raw) setPendingTool(JSON.parse(raw));
    } catch {
      /* nothing pending */
    }
  }, []);

  const dismissTool = () => {
    setPendingTool(null);
    try {
      localStorage.removeItem(LAB_TOOL_KEY);
    } catch {
      /* ignore */
    }
  };

  const addPendingTool = () => {
    if (!pendingTool) return;
    const xs = graph.nodes.map(n => n.x);
    dispatch({
      type: 'ADD_NODE',
      kind: 'tool',
      label: pendingTool.name,
      x: (xs.length ? Math.max(...xs) : 100) + 220,
      y: 260,
    });
    toast(`${pendingTool.name} added. Tap its ⊕ handle to wire it in.`, 'ok');
    dismissTool();
  };

  const askMentor = async () => {
    setMentorOpen(true);
    setMentorLoading(true);
    setMentorText('');
    try {
      const res = await api.post('/api/mentor/review', {
        nodes: graph.nodes.map(n => ({
          id: n.id,
          kind: n.kind,
          label: n.label,
          itols: n.itols ?? {},
        })),
        edges: graph.edges.map(e => ({ source: e.source, target: e.target, condition: e.condition })),
        budget: graph.budget,
      });
      setMentorText(String(res.data?.review ?? '').trim() || 'The mentor had nothing to add.');
    } catch {
      setMentorText('The mentor is unavailable right now. The eval bar and the engine both work offline — use those.');
    } finally {
      setMentorLoading(false);
    }
  };

  const markStageBuilt = () => {
    if (!stage || !task) return;
    // Belt and braces: the button is only rendered when the goals pass, but the
    // flag feeds a certificate, so re-derive it here rather than trusting the UI.
    if (!evaluateTask(task, graph).complete) {
      toast('Not all goals are met yet — the checklist shows what is left.', 'err');
      return;
    }
    markBuilt(stage.id);
    setStageBuilt(true);
    toast('Step built. Head back to the journey for what is next.', 'ok');
  };

  const guide = stage && task && (
    <BuildGuide task={task} graph={graph} stageHex={stage.hex} built={stageBuilt} onMarkBuilt={markStageBuilt} />
  );

  const reference = (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Chip tone="brand">{pattern?.code ?? 'A00'}</Chip>
        <span className="text-[11px] font-bold uppercase tracking-wider text-chalk-faint">{pattern?.family}</span>
      </div>
      <h2 className="text-[15px] font-bold mb-1.5">{pattern?.name ?? 'Free build'}</h2>
      <p className="text-[12.5px] leading-relaxed text-chalk-dim">{pattern?.summary}</p>

      {pattern && (
        <>
          <div className="label mt-4 mb-1.5">Reach for it when</div>
          <ul className="text-[12px] leading-relaxed text-chalk-dim space-y-1 list-disc pl-4">
            {pattern.useWhen.map(u => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <div className="label mt-4 mb-1.5">Known traps</div>
          <ul className="text-[12px] leading-relaxed text-chalk-dim space-y-1 list-disc pl-4">
            {pattern.pitfalls.map(u => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </>
      )}

      <button className="btn-ghost w-full mt-4 !text-xs" onClick={askMentor}>
        <MessageSquareText size={13} /> Ask the AI mentor
      </button>
      <Link to="/book" className="btn-quiet w-full mt-1.5 !text-xs">
        <BookOpen size={13} /> Browse all patterns
      </Link>
    </div>
  );

  // On a journey build the checklist leads and the pattern notes follow it;
  // a free build has no task, so the notes are all there is.
  const brief = guide ? (
    <>
      {guide}
      <details className="border-t border-ink-700">
        <summary className="px-4 py-2.5 text-[11.5px] font-semibold text-chalk-dim cursor-pointer select-none hover:text-chalk">
          How this pattern works, and what usually goes wrong
        </summary>
        {reference}
      </details>
    </>
  ) : (
    reference
  );

  const header = (
    <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-wrap">
      <Link to="/book" className="btn-quiet !px-2 !py-1.5 lg:hidden">
        <ChevronLeft size={16} />
      </Link>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-brand shrink-0" />
          <h1 className="text-[15px] font-extrabold truncate">Lab · {pattern?.name ?? 'Free build'}</h1>
        </div>
      </div>
      {/* During a journey build the switcher is hidden: every chip navigates
          away without ?stage=, which silently abandons the task and the work
          done so far. One link out, clearly labelled, is enough. */}
      {task ? (
        <Link to="/book" className="ml-auto btn-quiet !px-2.5 !py-1.5 !text-[11px] shrink-0">
          <BookOpen size={12} /> Pattern book
        </Link>
      ) : (
        <div className="ml-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {PATTERNS.map(p => (
            <Link
              key={p.id}
              to={`/lab/${p.id}`}
              onClick={() => toast(`Loaded ${p.name}`, 'info')}
              title={p.name}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition
                ${p.id === (preset ?? 'react') ? 'bg-brand text-white border-brand' : 'bg-ink-850 text-chalk-dim border-ink-700 hover:text-chalk'}`}
            >
              {/* The code meant nothing to anyone who had not read the book. */}
              {p.name.split(/[ /]/)[0]}
            </Link>
          ))}
          <Link
            to="/lab/blank"
            title="Start from an empty canvas"
            className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition
              ${preset === 'blank' ? 'bg-brand text-white border-brand' : 'bg-ink-850 text-chalk-dim border-ink-700 hover:text-chalk'}`}
          >
            Blank
          </Link>
        </div>
      )}
    </div>
  );

  const headerWithTool = (
    <>
      {header}
      {stage && (
        <div
          className="mx-3 mb-2 px-3 py-2 rounded-lg border flex items-center gap-2 animate-popIn"
          style={{ borderColor: `${stage.hex}55`, background: `${stage.hex}12` }}
        >
          <Hammer size={14} className="shrink-0" style={{ color: stage.hex }} />
          <span className="text-[12px] text-chalk min-w-0 grow">
            <span className="font-bold">Step {stage.n} · {stage.formal}</span>
            <span className="text-chalk-dim"> — {stage.buildLabel}</span>
          </span>
          {stageBuilt ? (
            <span className="text-[11px] font-bold text-eval-up shrink-0">Built ✓</span>
          ) : (
            // The goal counter lives here; the button that acts on it lives in
            // the checklist, beside the goals that justify it.
            <span className="text-[11px] font-bold font-mono shrink-0" style={{ color: stage.hex }}>
              {task ? `${evaluateTask(task, graph).done}/${task.goals.length}` : ''}
            </span>
          )}
          <Link to={`/journey/${stage.id}`} className="btn-quiet !px-2 !py-1 !text-[11px] shrink-0">
            Back to step
          </Link>
        </div>
      )}
      {pendingTool && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-eval-info/10 border border-eval-info/40 flex items-center gap-2 animate-popIn">
          <Plug size={14} className="text-eval-info shrink-0" />
          <span className="text-[12px] text-chalk min-w-0 grow">
            <span className="font-bold">{pendingTool.name}</span>
            <span className="text-chalk-dim"> is ready to add as a tool{pendingTool.meta ? ` · ${pendingTool.meta}` : ''}</span>
          </span>
          <button className="btn-primary !px-2.5 !py-1 !text-[11px] shrink-0" onClick={addPendingTool}>
            Add it
          </button>
          <button className="btn-quiet !px-1.5 !py-1 shrink-0" onClick={dismissTool} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      <Workbench header={headerWithTool} brief={brief} briefLabel={guide ? 'Build' : undefined} />
      <Modal open={mentorOpen} onClose={() => setMentorOpen(false)} title="AI mentor review" wide>
        {mentorLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-3.5 rounded bg-ink-750 scan animate-shimmer" style={{ width: `${90 - i * 12}%` }} />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {mentorText.split('\n').filter(Boolean).map((linetext, i) => (
              <p key={i} className="text-[13.5px] leading-relaxed text-chalk">
                {linetext.replace(/^[-•]\s*/, '· ')}
              </p>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
