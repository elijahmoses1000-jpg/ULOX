import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { AgentGraph, EDGE_CONDITIONS, EdgeCondition, ItolsKey, KIND_META, Move, typeIdOf } from '../lib/agentic';
import { GROUP_BLURB, NodeType, TYPES_BY_GROUP, itolsKeysFor, nodeType } from '../lib/node-catalog';
import { ITOLS_HELP } from '../lib/analyzer';
import { Selection } from '../lib/store';
import { Chip, Empty } from './ui';

/** Quick-insert bar, borrowed from mobile code editors: the characters a phone
 *  keyboard buries two taps deep are the ones a contract needs most. */
const SYMBOLS = ['{', '}', '"', ':', ',', '[', ']', '→', '|', '≤'];

function ItolsField({
  nodeId,
  field,
  value,
  onChange,
}: {
  nodeId: string;
  field: ItolsKey;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const help = ITOLS_HELP[field];
  const filled = value.trim().length >= 8;

  useEffect(() => {
    setOpen(false);
  }, [nodeId]);

  const insert = (token: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="border-b border-ink-700 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-ink-750/60 transition text-left"
      >
        <span
          className="w-1.5 h-6 rounded-full shrink-0"
          style={{ background: filled ? '#3FD07A' : '#4A4E53' }}
          aria-hidden
        />
        <span className="grow min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-chalk">{help.title}</span>
            {filled ? (
              <Check size={13} className="text-eval-up" />
            ) : (
              <span className="text-[10px] font-bold text-eval-warn uppercase tracking-wide">empty</span>
            )}
          </span>
          {!open && (
            <span className="block text-[11.5px] text-chalk-faint truncate mt-0.5">
              {value.trim() || help.blurb}
            </span>
          )}
        </span>
        <ChevronDown size={15} className={`text-chalk-faint transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-3 -mt-0.5">
          <p className="text-[11.5px] leading-snug text-chalk-dim mb-2">{help.blurb}</p>
          <textarea
            ref={ref}
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={help.placeholder}
            aria-label={`${help.title} contract`}
            className="field font-mono !text-[12px] leading-relaxed resize-y min-h-[76px]"
          />
          <div className="flex items-center gap-1 mt-1.5 overflow-x-auto no-scrollbar">
            {SYMBOLS.map(s => (
              <button
                key={s}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(s)}
                className="shrink-0 w-8 h-8 rounded-md bg-ink-750 border border-ink-600 text-chalk-dim
                           hover:text-chalk hover:border-ink-500 font-mono text-sm"
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(help.placeholder)}
              className="shrink-0 ml-auto btn-quiet !px-2 !py-1 !text-[11px]"
              title="Insert the canonical contract for this field"
            >
              <Wand2 size={12} /> Canonical
            </button>
          </div>
          <div className="mt-1 text-right text-[10px] font-mono text-chalk-faint">{value.trim().length} chars</div>
        </div>
      )}
    </div>
  );
}

/**
 * The parts bin.
 *
 * Thirty parts is past the point where a flat grid helps, so this groups them
 * the way someone building thinks — where a run starts, what it reasons with,
 * what it calls out to — and puts a search box on top for the person who
 * already knows the name. Groups open one at a time; searching opens all of
 * them, because a filtered list has nothing to hide.
 */
function Palette({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>('Reasoning');

  const needle = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      TYPES_BY_GROUP.map(({ group, types }) => ({
        group,
        types: needle
          ? types.filter(t => `${t.label} ${t.hint} ${t.use} ${t.group}`.toLowerCase().includes(needle))
          : types,
      })).filter(g => g.types.length),
    [needle]
  );
  const total = groups.reduce((n, g) => n + g.types.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="label">Add a node</span>
        <span className="text-[10.5px] font-mono text-chalk-faint">{total} parts</span>
      </div>

      <div className="panel-flat flex items-center gap-2 px-2.5 py-1.5 mb-2">
        <Search size={13} className="text-chalk-faint shrink-0" />
        <input
          className="bg-transparent outline-none text-[12.5px] text-chalk placeholder:text-chalk-faint grow min-w-0"
          placeholder="Search parts — guard, memory, retry…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search node types"
        />
        {query && (
          <button className="shrink-0 text-chalk-faint hover:text-chalk" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
      </div>

      {!total && (
        <p className="text-[11.5px] text-chalk-faint px-1 py-3 leading-relaxed">
          Nothing matches “{query.trim()}”. Try the thing it does rather than its name — “retry”, “stop”, “remember”.
        </p>
      )}

      <div className="space-y-1.5">
        {groups.map(({ group, types }) => {
          const open = !!needle || openGroup === group;
          return (
            <div key={group} className="panel-flat overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ink-750/60 transition"
                onClick={() => setOpenGroup(g => (g === group ? null : group))}
              >
                <span className="grow min-w-0">
                  <span className="text-[12.5px] font-bold text-chalk">{group}</span>
                  <span className="block text-[10.5px] text-chalk-faint leading-snug mt-0.5">{GROUP_BLURB[group]}</span>
                </span>
                <span className="text-[10.5px] font-mono text-chalk-faint shrink-0">{types.length}</span>
                <ChevronDown size={14} className={`text-chalk-faint shrink-0 transition ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div className="border-t border-ink-700 divide-y divide-ink-700">
                  {types.map(type => (
                    <button
                      key={type.id}
                      onClick={() => onAdd(type)}
                      className="w-full px-3 py-2.5 text-left hover:bg-ink-750/60 transition group"
                    >
                      <span className="text-[12.5px] font-bold text-chalk group-hover:text-brand-bright">{type.label}</span>
                      <span className="block text-[10.5px] text-chalk-faint leading-snug mt-0.5">{type.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Inspector({
  graph,
  selection,
  onMove,
  onDeleteNode,
  onDeleteEdge,
  onAddNode,
  readOnly,
}: {
  graph: AgentGraph;
  selection: Selection;
  onMove: (move: Move) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onAddNode: (type: NodeType) => void;
  readOnly?: boolean;
}) {
  const node = selection?.type === 'node' ? graph.nodes.find(n => n.id === selection.id) : undefined;
  const edge = selection?.type === 'edge' ? graph.edges.find(e => e.id === selection.id) : undefined;

  if (readOnly) {
    return (
      <Empty
        title="Review mode"
        hint="You are scrubbing through a finished run. Return to the live position to edit the graph."
      />
    );
  }

  if (edge) {
    const source = graph.nodes.find(n => n.id === edge.source);
    const target = graph.nodes.find(n => n.id === edge.target);
    return (
      <div className="p-4">
        <div className="label mb-2">Edge</div>
        <div className="panel-flat px-3 py-2.5 text-sm font-semibold text-chalk mb-4">
          {source?.label} <span className="text-chalk-faint">→</span> {target?.label}
        </div>

        <div className="label mb-2">Condition</div>
        <div className="grid grid-cols-2 gap-1.5">
          {EDGE_CONDITIONS.map(c => (
            <button
              key={c}
              onClick={() => onMove({ type: 'SET_CONDITION', edgeId: edge.id, condition: c as EdgeCondition })}
              className={`px-2.5 py-2 rounded-lg text-[11.5px] font-bold border transition text-left
                ${edge.condition === c ? 'bg-brand text-white border-brand' : 'bg-ink-850 text-chalk-dim border-ink-700 hover:border-ink-500 hover:text-chalk'}`}
            >
              {c.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-chalk-faint">
          “always” can never break a loop. Any other condition can, which is what the cycle check looks for.
        </p>

        {!edge.locked && (
          <button className="btn-ghost w-full mt-4 !text-eval-down" onClick={() => onDeleteEdge(edge.id)}>
            <Trash2 size={14} /> Remove edge
          </button>
        )}
      </div>
    );
  }

  if (node) {
    const part = nodeType(typeIdOf(node));
    const contractKeys = itolsKeysFor(node.kind);
    return (
      <div>
        <div className="px-4 pt-4 pb-3 border-b border-ink-700">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Chip tone="brand">{part?.label ?? KIND_META[node.kind].label}</Chip>
            {part && <Chip>{part.group}</Chip>}
            {node.locked && <Chip>locked by puzzle</Chip>}
          </div>
          <div className="text-[15px] font-bold text-chalk">{node.label}</div>
          <p className="text-[11.5px] text-chalk-dim mt-1">{part?.use ?? KIND_META[node.kind].hint}</p>
        </div>

        {contractKeys.length ? (
          <div>
            <div className="px-4 py-2 label bg-ink-850/60">
              {node.kind === 'terminal' ? 'Outcome contract' : 'ITOLS contract'}
            </div>
            {node.kind === 'terminal' && (
              <p className="px-4 pt-2.5 text-[11.5px] leading-relaxed text-chalk-dim">
                An output is where the run stops, so it is the one node that has to say what “done” means. Without an
                Outcome here, nothing upstream can tell whether it is allowed to finish.
              </p>
            )}
            {contractKeys.map(key => (
              <ItolsField
                key={key}
                nodeId={node.id}
                field={key}
                value={node.itols?.[key] ?? ''}
                onChange={v => onMove({ type: 'UPDATE_ITOLS', nodeId: node.id, key, value: v })}
              />
            ))}
          </div>
        ) : node.kind === 'tool' ? (
          <div className="p-4 space-y-3">
            <div className="label">Tool contract</div>
            <div className="panel-flat px-3 py-2 font-mono text-[12px]">
              <div className="text-chalk-faint">in</div>
              <div className="text-chalk">{node.contract?.input}</div>
              <div className="text-chalk-faint mt-2">out</div>
              <div className="text-chalk">{node.contract?.output}</div>
              <div className="text-chalk-faint mt-2">cost</div>
              <div className="text-chalk">{node.contract?.cost} tokens / call</div>
            </div>
            <p className="text-[11.5px] leading-snug text-chalk-faint">
              The analyzer compares this output against whatever the downstream node declares it expects. A mismatch is a
              critical fault before anything runs.
            </p>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-[12px] leading-snug text-chalk-dim">{part?.hint ?? KIND_META[node.kind].hint}</p>
          </div>
        )}

        {!node.locked && (
          <div className="p-4 border-t border-ink-700">
            <button className="btn-ghost w-full !text-eval-down" onClick={() => onDeleteNode(node.id)}>
              <Trash2 size={14} /> Remove node
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <Palette onAdd={onAddNode} />

      <div className="mt-5 panel-flat p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles size={13} className="text-brand" />
          <span className="text-[12px] font-bold text-chalk">How to edit</span>
        </div>
        <ul className="text-[11.5px] leading-relaxed text-chalk-dim space-y-1 list-disc pl-4">
          <li>Tap a node to open its ITOLS contract.</li>
          <li>Tap the ⊕ handle on a node, then tap another node to connect them.</li>
          <li>Tap an edge to change the condition that fires it.</li>
          <li>Drag anywhere to pan, pinch or scroll to zoom.</li>
        </ul>
      </div>

      <div className="mt-4">
        <div className="label mb-2">Run parameters</div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="panel-flat py-2">
            <div className="text-[9px] uppercase tracking-wide text-chalk-faint">Budget</div>
            <div className="font-mono text-[13px] font-bold text-chalk">{graph.budget}</div>
          </div>
          <div className="panel-flat py-2">
            <div className="text-[9px] uppercase tracking-wide text-chalk-faint">Facts req.</div>
            <div className="font-mono text-[13px] font-bold text-chalk">{graph.requiredFacts}</div>
          </div>
          <div className="panel-flat py-2">
            <div className="text-[9px] uppercase tracking-wide text-chalk-faint">Max retries</div>
            <div className="font-mono text-[13px] font-bold text-chalk">{graph.maxRetries}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
