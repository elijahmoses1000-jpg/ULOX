import { ArrowRight, Check, Circle } from 'lucide-react';
import { AgentGraph, CONDITION_LABEL, GraphEdge, KIND_META, NodeKind } from '../lib/agentic';
import { Modal } from './ui';

/**
 * The shape of the thing, before you wire it.
 *
 * People were opening Build and seeing a canvas with no picture in their head
 * of what it was meant to become. The goals say it in words; this says it in
 * a diagram, and then in a build order: which pieces, in what sequence, which
 * arrows, and what makes each arrow fire.
 *
 * It doubles as a progress map. Anything already on your canvas is drawn
 * solid and ticked, anything still missing is dotted, so the same picture
 * answers "what am I building" at the start and "what is left" in the middle.
 */

const KIND_HUE: Record<NodeKind, string> = {
  entry: '#71777E',
  agent: '#4EA8FF',
  tool: '#3FD07A',
  guard: '#F5A524',
  memory: '#B57BFF',
  condition: '#9B7BFF',
  terminal: '#EE1B24',
};

const VB_W = 760;
const NODE_W = 128;
const NODE_H = 46;
const PAD_X = NODE_W / 2 + 14;
/** Tall enough for a bowed arrow and its label to clear the top node row. */
const PAD_Y = NODE_H / 2 + 48;
const MAX_H = 430;
/** How far an arrow bows off the straight line between two boxes. */
const BOW = 34;

interface Point {
  x: number;
  y: number;
}

/**
 * Fit the pattern's own coordinates into the diagram box.
 *
 * The scale is uniform, so a row of boxes stays a row instead of being
 * stretched to fill a fixed height, and the box is then sized to the content
 * rather than reserving space nothing draws into.
 */
function project(nodes: AgentGraph['nodes']) {
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1, Math.max(...xs) - minX);
  const spanY = Math.max(0, Math.max(...ys) - minY);

  let scale = (VB_W - PAD_X * 2) / spanX;
  if (spanY * scale + PAD_Y * 2 > MAX_H) scale = (MAX_H - PAD_Y * 2) / Math.max(1, spanY);

  const at = new Map<string, Point>();
  for (const n of nodes) {
    at.set(n.id, { x: PAD_X + (n.x - minX) * scale, y: PAD_Y + (n.y - minY) * scale });
  }
  return { at, height: Math.round(spanY * scale + PAD_Y * 2) };
}

/** Where a line from `from` towards `to` leaves the node box around `to`. */
function edgeOfBox(to: Point, from: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!dx && !dy) return to;
  const t = Math.min(Math.abs(dx) ? NODE_W / 2 / Math.abs(dx) : Infinity, Math.abs(dy) ? NODE_H / 2 / Math.abs(dy) : Infinity);
  return { x: to.x - dx * t, y: to.y - dy * t };
}

/**
 * Lay out one arrow: bowed off the straight line, trimmed to both boxes.
 *
 * Forward arrows bow one way and return arrows the other, so the two halves
 * of a loop cannot land their labels on the same spot — which is exactly how
 * "needs more info" and "tool succeeded" ended up printed over each other.
 */
function arc(a: Point, b: Point, lane: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const lift = -BOW * (1 + lane * 0.75);
  const ctrl = { x: (a.x + b.x) / 2 + nx * lift, y: (a.y + b.y) / 2 + ny * lift };
  const start = edgeOfBox(a, ctrl);
  const end = edgeOfBox(b, ctrl);
  // The apex of a quadratic sits halfway between the midpoint and the control.
  const apex = { x: (start.x + end.x) / 4 + ctrl.x / 2, y: (start.y + end.y) / 4 + ctrl.y / 2 };
  const above = ctrl.y <= (a.y + b.y) / 2;
  return { d: `M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`, label: { x: apex.x, y: apex.y + (above ? -7 : 14) } };
}

/** Does the learner's graph already contain an edge of this shape? */
function hasEdge(mine: AgentGraph, target: AgentGraph, source: string, dest: string, condition: string) {
  const kindOf = (g: AgentGraph, id: string) => g.nodes.find(n => n.id === id)?.kind;
  const from = kindOf(target, source);
  const to = kindOf(target, dest);
  if (!from || !to) return false;
  return mine.edges.some(e => {
    const s = mine.nodes.find(n => n.id === e.source);
    const t = mine.nodes.find(n => n.id === e.target);
    return s?.kind === from && t?.kind === to && e.condition === condition;
  });
}

/**
 * The order to add the boxes in: follow the arrows out from the entry.
 *
 * Reading order on the canvas is not build order — a return edge points
 * backwards — so this walks the graph instead of sorting by position.
 */
function buildOrder(graph: AgentGraph) {
  const targets = new Set(graph.edges.map(e => e.target));
  const roots = graph.nodes.filter(n => !targets.has(n.id));
  const queue = (roots.length ? roots : graph.nodes.slice(0, 1)).map(n => n.id);
  const seen = new Set<string>(queue);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of graph.edges) {
      if (e.source === id && !seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) order.push(n.id);
  return order.map(id => graph.nodes.find(n => n.id === id)!).filter(Boolean);
}

export function Blueprint({
  open,
  onClose,
  target,
  mine,
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  /** The architecture being built towards. */
  target: AgentGraph;
  /** What is on the canvas right now, used to mark progress. */
  mine?: AgentGraph;
  title: string;
  subtitle?: string;
}) {
  const { at, height } = project(target.nodes);
  const order = buildOrder(target);

  // Arrows between the same pair of boxes share a bow, so each gets its own
  // lane rather than three identical curves stacked on one another.
  const lanes = new Map<string, number>();
  const laneOf = (e: GraphEdge) => {
    const key = [e.source, e.target].sort().join('>');
    const lane = lanes.get(key) ?? 0;
    lanes.set(key, lane + 1);
    return lane;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="The shape you are building"
      wide
      footer={
        <button className="btn-primary !text-xs" onClick={onClose}>
          Start building
        </button>
      }
    >
      <h3 className="font-display text-[15px] font-bold">{title}</h3>
      {subtitle && <p className="text-[12.5px] text-chalk-dim mt-1 leading-relaxed">{subtitle}</p>}

      <div className="panel-flat mt-3 p-2 hidden md:block">
        <svg
          viewBox={`0 0 ${VB_W} ${height}`}
          className="w-full h-auto"
          role="img"
          aria-label="Diagram of the target architecture"
        >
          <defs>
            <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#5A6069" />
            </marker>
          </defs>

          {target.edges.map(edge => {
            const a = at.get(edge.source);
            const b = at.get(edge.target);
            if (!a || !b) return null;
            const built = mine ? hasEdge(mine, target, edge.source, edge.target, edge.condition) : false;
            const { d, label } = arc(a, b, laneOf(edge));
            const text = CONDITION_LABEL[edge.condition] ?? edge.condition;
            return (
              <g key={edge.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={built ? '#6F7680' : '#3A3E43'}
                  strokeWidth={built ? 2.4 : 1.8}
                  strokeDasharray={built ? undefined : '5 5'}
                  markerEnd="url(#bp-arrow)"
                />
                {/* A plate behind the words: an arrow crossing a label is the
                    difference between a diagram and a smudge. */}
                <rect
                  x={label.x - (text.length * 5.3) / 2 - 5}
                  y={label.y - 9}
                  width={text.length * 5.3 + 10}
                  height={14}
                  rx={4}
                  fill="#16181B"
                />
                <text
                  x={label.x}
                  y={label.y + 1}
                  textAnchor="middle"
                  fontSize="10"
                  fill={built ? '#A5ABB3' : '#787E86'}
                  fontWeight={built ? 600 : 400}
                >
                  {text}
                </text>
              </g>
            );
          })}

          {target.nodes.map(node => {
            const p = at.get(node.id)!;
            const hue = KIND_HUE[node.kind] ?? '#4EA8FF';
            const built = mine ? mine.nodes.some(n => n.kind === node.kind) : false;
            return (
              <g key={node.id}>
                <rect
                  x={p.x - NODE_W / 2}
                  y={p.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={9}
                  fill="#16181B"
                  stroke={hue}
                  strokeWidth={built ? 2.2 : 1.4}
                  strokeDasharray={built ? undefined : '5 4'}
                  opacity={built ? 1 : 0.8}
                />
                <circle cx={p.x - NODE_W / 2 + 15} cy={p.y} r={4.5} fill={hue} opacity={built ? 1 : 0.5} />
                <text x={p.x - NODE_W / 2 + 26} y={p.y - 2} fontSize="9" fill={hue} fontWeight={700} letterSpacing="0.6">
                  {KIND_META[node.kind].label.toUpperCase()}
                </text>
                <text x={p.x - NODE_W / 2 + 26} y={p.y + 11} fontSize="10.5" fill={built ? '#E9EBEE' : '#8C9299'}>
                  {node.label.length > 15 ? `${node.label.slice(0, 14)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {mine && (
        <p className="text-[11.5px] text-chalk-faint mt-2.5 leading-relaxed hidden md:block">
          Solid outlines are already on your canvas. Dotted ones are still to add.
        </p>
      )}

      <div className="label mt-4 mb-2">Add them in this order</div>
      <ol className="space-y-1.5">
        {order.map((node, i) => {
          const built = mine ? mine.nodes.some(n => n.kind === node.kind) : false;
          return (
            <li key={node.id} className="flex items-start gap-2.5 panel-flat px-3 py-2">
              <span className="mt-0.5 shrink-0">
                {built ? (
                  <Check size={13} style={{ color: KIND_HUE[node.kind] }} />
                ) : (
                  <Circle size={12} className="text-chalk-faint" />
                )}
              </span>
              <span className="text-[11.5px] leading-relaxed min-w-0">
                <span className="font-mono text-[11px] text-chalk-faint mr-1.5">{i + 1}.</span>
                <span className="font-bold" style={{ color: KIND_HUE[node.kind] }}>
                  {KIND_META[node.kind].label}
                </span>
                <span className="text-chalk"> — {node.label}</span>
                <span className="text-chalk-dim"> · {KIND_META[node.kind].hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="label mt-4 mb-2">Then wire them like this</div>
      <ul className="space-y-1.5">
        {target.edges.map(edge => {
          const from = target.nodes.find(n => n.id === edge.source);
          const to = target.nodes.find(n => n.id === edge.target);
          if (!from || !to) return null;
          const wired = mine ? hasEdge(mine, target, edge.source, edge.target, edge.condition) : false;
          return (
            <li key={edge.id} className="flex items-start gap-2.5 panel-flat px-3 py-2">
              <span className="mt-0.5 shrink-0">
                {wired ? (
                  <Check size={13} style={{ color: KIND_HUE[to.kind] }} />
                ) : (
                  <Circle size={12} className="text-chalk-faint" />
                )}
              </span>
              <span className="text-[11.5px] leading-relaxed min-w-0">
                <span className="text-chalk font-semibold">{from.label}</span>
                <ArrowRight size={11} className="inline mx-1.5 -mt-0.5 text-chalk-faint" />
                <span className="text-chalk font-semibold">{to.label}</span>
                <span className="text-chalk-dim"> — when </span>
                <span className="font-mono text-[11px]" style={{ color: KIND_HUE[to.kind] }}>
                  {CONDITION_LABEL[edge.condition] ?? edge.condition}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-[11.5px] text-chalk-faint mt-3.5 leading-relaxed">
        The condition is what makes an arrow fire, and getting those right is most of the work: an arrow marked
        “always” where it should read “tool succeeded” is how a failure gets treated as a fact.
      </p>
    </Modal>
  );
}
