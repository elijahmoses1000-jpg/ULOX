import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Brain, CheckCircle2, CircleDot, Database, GitBranch, Shield, Wrench } from 'lucide-react';
import { AgentGraph, CONDITION_LABEL, GraphNode, NodeKind } from '../lib/agentic';
import { Issue } from '../lib/analyzer';
import { Selection } from '../lib/store';

const NODE_W = 172;
const NODE_H = 62;

const KIND_STYLE: Record<NodeKind, { fill: string; stroke: string; icon: React.ReactNode; badge: string }> = {
  entry: { fill: '#1D2A22', stroke: '#3FD07A', icon: <CircleDot size={14} />, badge: '#3FD07A' },
  agent: { fill: '#2A1C1D', stroke: '#EE1B24', icon: <Brain size={14} />, badge: '#EE1B24' },
  tool: { fill: '#1B2530', stroke: '#4EA8FF', icon: <Wrench size={14} />, badge: '#4EA8FF' },
  condition: { fill: '#2A2519', stroke: '#F5A524', icon: <GitBranch size={14} />, badge: '#F5A524' },
  guard: { fill: '#241C2E', stroke: '#B57BFF', icon: <Shield size={14} />, badge: '#B57BFF' },
  memory: { fill: '#1C2A2A', stroke: '#38C4C4', icon: <Database size={14} />, badge: '#38C4C4' },
  terminal: { fill: '#22242A', stroke: '#E9EBEE', icon: <CheckCircle2 size={14} />, badge: '#E9EBEE' },
};

export interface CanvasProps {
  graph: AgentGraph;
  issues?: Issue[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMoveNode?: (id: string, x: number, y: number) => void;
  onConnect?: (source: string, target: string) => void;
  /** Node id currently executing in the trace. */
  activeNodeId?: string | null;
  /** Ids visited so far in the trace, for the run highlight. */
  visited?: string[];
  readOnly?: boolean;
  height?: string;
}

interface View {
  x: number;
  y: number;
  k: number;
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(45, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function anchors(a: GraphNode, b: GraphNode) {
  const ac = { x: a.x + NODE_W / 2, y: a.y + NODE_H / 2 };
  const bc = { x: b.x + NODE_W / 2, y: b.y + NODE_H / 2 };
  const horizontal = Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y);
  if (horizontal) {
    const right = bc.x >= ac.x;
    return {
      x1: right ? a.x + NODE_W : a.x,
      y1: ac.y,
      x2: right ? b.x : b.x + NODE_W,
      y2: bc.y,
    };
  }
  const down = bc.y >= ac.y;
  return {
    x1: ac.x,
    y1: down ? a.y + NODE_H : a.y,
    x2: bc.x,
    y2: down ? b.y : b.y + NODE_H,
  };
}

export function GraphCanvas({
  graph,
  issues = [],
  selection,
  onSelect,
  onMoveNode,
  onConnect,
  activeNodeId,
  visited = [],
  readOnly,
  height = '100%',
}: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 20, y: 10, k: 0.92 });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const dragRef = useRef<{ id: string | null; ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; k: number } | null>(null);
  /** When a real pointerup last resolved a tap, so the click echo is ignored. */
  const handledAt = useRef(0);

  const issuesByNode = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      const list = map.get(issue.nodeId) ?? [];
      list.push(issue);
      map.set(issue.nodeId, list);
    }
    return map;
  }, [issues]);

  const visitedSet = useMemo(() => new Set(visited), [visited]);

  // Fit the graph on first load and whenever the node set changes size.
  const nodeSignature = graph.nodes.map(n => n.id).join(',');
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || graph.nodes.length === 0) return;
    const minX = Math.min(...graph.nodes.map(n => n.x));
    const maxX = Math.max(...graph.nodes.map(n => n.x + NODE_W));
    const minY = Math.min(...graph.nodes.map(n => n.y));
    const maxY = Math.max(...graph.nodes.map(n => n.y + NODE_H));
    const w = el.clientWidth || 600;
    const h = el.clientHeight || 400;
    const k = Math.max(0.42, Math.min(1.1, Math.min((w - 48) / (maxX - minX), (h - 48) / (maxY - minY))));
    setView({ k, x: (w - (maxX - minX) * k) / 2 - minX * k, y: (h - (maxY - minY) * k) / 2 - minY * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSignature]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
    },
    [view]
  );

  const onPointerDown = (e: React.PointerEvent, nodeId: string | null) => {
    if (e.button === 2) return;
    try {
      // Throws for pointers the browser is not currently tracking; capture is a
      // nicety here and must never take the whole canvas down with it.
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* no capture available — dragging still works via the move handler */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      dragRef.current = null;
      return;
    }

    if (nodeId && !readOnly) {
      const node = graph.nodes.find(n => n.id === nodeId)!;
      const world = toWorld(e.clientX, e.clientY);
      dragRef.current = { id: nodeId, ox: world.x - node.x, oy: world.y - node.y, sx: e.clientX, sy: e.clientY, moved: false };
    } else {
      dragRef.current = { id: null, ox: e.clientX - view.x, oy: e.clientY - view.y, sx: e.clientX, sy: e.clientY, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.max(0.32, Math.min(2, (pinchRef.current.k * dist) / (pinchRef.current.dist || 1)));
      setView(v => ({ ...v, k }));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;

    if (drag.id) {
      const world = toWorld(e.clientX, e.clientY);
      onMoveNode?.(drag.id, Math.round(world.x - drag.ox), Math.round(world.y - drag.oy));
    } else {
      setView(v => ({ ...v, x: e.clientX - drag.ox, y: e.clientY - drag.oy }));
    }
  };

  /** Shared tap resolution, reached from either a pointerup or a plain click. */
  const commitTap = (nodeId: string | null) => {
    handledAt.current = Date.now();
    if (nodeId) {
      if (connectFrom && connectFrom !== nodeId) {
        onConnect?.(connectFrom, nodeId);
        setConnectFrom(null);
        return;
      }
      onSelect({ type: 'node', id: nodeId });
    } else {
      setConnectFrom(null);
      onSelect(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent, nodeId: string | null) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    commitTap(nodeId);
  };

  /**
   * Pointer events alone are not enough: assistive tech, some automation
   * drivers and a few mobile browsers deliver a click without a matching
   * pointerup. Handle click too, ignoring the echo that follows a real tap.
   */
  const onClickFallback = (nodeId: string | null) => {
    if (Date.now() - handledAt.current < 400) return;
    if (dragRef.current?.moved) return;
    commitTap(nodeId);
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView(v => {
      const k = Math.max(0.32, Math.min(2, v.k * factor));
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };

  const nodeById = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full graph-grid rounded-xl overflow-hidden touch-none"
      style={{ height }}
      onWheel={onWheel}
      onPointerDown={e => onPointerDown(e, null)}
      onPointerMove={onPointerMove}
      onPointerUp={e => onPointerUp(e, null)}
      onClick={() => onClickFallback(null)}
      onPointerCancel={e => {
        pointers.current.delete(e.pointerId);
        dragRef.current = null;
      }}
    >
      <svg className="absolute inset-0 w-full h-full" role="presentation">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5A6068" />
          </marker>
          <marker id="arrow-live" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#EE1B24" />
          </marker>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {graph.edges.map(edge => {
            const a = nodeById.get(edge.source);
            const b = nodeById.get(edge.target);
            if (!a || !b) return null;
            const { x1, y1, x2, y2 } = anchors(a, b);
            const selected = selection?.type === 'edge' && selection.id === edge.id;
            const live = visitedSet.has(edge.source) && visitedSet.has(edge.target);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            return (
              <g key={edge.id} className="cursor-pointer">
                <path
                  d={bezier(x1, y1, x2, y2)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  onPointerUp={ev => {
                    ev.stopPropagation();
                    pointers.current.delete(ev.pointerId);
                    dragRef.current = null;
                    onSelect({ type: 'edge', id: edge.id });
                  }}
                />
                <path
                  d={bezier(x1, y1, x2, y2)}
                  fill="none"
                  stroke={selected ? '#EE1B24' : live ? '#8A5054' : '#4A4E53'}
                  strokeWidth={selected ? 2.6 : 1.8}
                  markerEnd={selected || live ? 'url(#arrow-live)' : 'url(#arrow)'}
                  className={live ? 'edge-flow' : ''}
                  pointerEvents="none"
                />
                <g pointerEvents="none" transform={`translate(${mx},${my})`}>
                  <rect
                    x={-CONDITION_LABEL[edge.condition].length * 3.1 - 6}
                    y={-9}
                    rx={5}
                    width={CONDITION_LABEL[edge.condition].length * 6.2 + 12}
                    height={18}
                    fill="#0E0F11"
                    stroke={selected ? '#EE1B24' : '#2E3237'}
                  />
                  <text
                    textAnchor="middle"
                    y={4}
                    fontSize={10}
                    fontWeight={700}
                    fill={edge.condition === 'always' ? '#8B9198' : '#C9CED4'}
                  >
                    {CONDITION_LABEL[edge.condition]}
                  </text>
                </g>
              </g>
            );
          })}

          {graph.nodes.map(node => {
            const style = KIND_STYLE[node.kind];
            const selected = selection?.type === 'node' && selection.id === node.id;
            const active = activeNodeId === node.id;
            const nodeIssues = issuesByNode.get(node.id) ?? [];
            const critical = nodeIssues.some(i => i.severity === 'critical');
            const warn = nodeIssues.some(i => i.severity === 'warning');
            const isSource = connectFrom === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                className={readOnly ? 'cursor-pointer' : 'cursor-grab'}
                onPointerDown={e => {
                  e.stopPropagation();
                  onPointerDown(e, node.id);
                }}
                onPointerMove={onPointerMove}
                onClick={e => {
                  e.stopPropagation();
                  onClickFallback(node.id);
                }}
                onPointerUp={e => {
                  e.stopPropagation();
                  onPointerUp(e, node.id);
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  fill={style.fill}
                  stroke={selected || isSource ? '#EE1B24' : active ? '#FFFFFF' : style.stroke}
                  strokeWidth={selected || isSource || active ? 2.4 : 1.4}
                  className="node-shadow"
                  opacity={visited.length && !visitedSet.has(node.id) ? 0.55 : 1}
                />
                {active && (
                  <rect width={NODE_W} height={NODE_H} rx={12} fill="none" stroke="#FFFFFF" strokeWidth={1} opacity={0.5}>
                    <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.1s" repeatCount="indefinite" />
                  </rect>
                )}
                <foreignObject x={0} y={0} width={NODE_W} height={NODE_H}>
                  <div className="h-full w-full px-3 py-2 flex flex-col justify-center pointer-events-none">
                    <div className="flex items-center gap-1.5" style={{ color: style.badge }}>
                      {style.icon}
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.12em]">{node.kind}</span>
                      {node.locked && <span className="text-[9px] text-chalk-faint">· locked</span>}
                    </div>
                    <div className="text-[12.5px] font-bold text-chalk leading-tight truncate mt-0.5">{node.label}</div>
                    {(node.kind === 'agent' || node.kind === 'guard') && (
                      <div className="flex gap-1 mt-1">
                        {(['identity', 'tasks', 'outcome', 'language', 'security'] as const).map(k => (
                          <span
                            key={k}
                            className="h-1 w-4 rounded-full"
                            style={{ background: (node.itols?.[k] ?? '').trim().length >= 8 ? '#3FD07A' : '#3A3E43' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </foreignObject>

                {(critical || warn) && (
                  <g transform={`translate(${NODE_W - 10}, 10)`} pointerEvents="none">
                    <circle r={7} fill={critical ? '#FF5A5F' : '#F5A524'} />
                    <text textAnchor="middle" y={3.5} fontSize={9} fontWeight={900} fill="#12130F">
                      !
                    </text>
                  </g>
                )}

                {!readOnly && onConnect && (
                  <g
                    transform={`translate(${NODE_W}, ${NODE_H / 2})`}
                    className="cursor-crosshair"
                    onPointerDown={e => e.stopPropagation()}
                    onPointerUp={e => {
                      e.stopPropagation();
                      pointers.current.delete(e.pointerId);
                      dragRef.current = null;
                      setConnectFrom(prev => (prev === node.id ? null : node.id));
                    }}
                  >
                    {/* Generous invisible hit area — 18px is unusable on a phone. */}
                    <circle r={18} fill="transparent" />
                    <circle r={9} fill={isSource ? '#EE1B24' : '#26282C'} stroke={isSource ? '#EE1B24' : '#4A4E53'} strokeWidth={1.4} />
                    <path d="M -3.5 0 H 3.5 M 0 -3.5 V 3.5" stroke={isSource ? '#fff' : '#A5ABB3'} strokeWidth={1.7} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {connectFrom && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-brand text-white text-xs font-bold shadow-pop animate-popIn">
          Tap a node to connect from “{nodeById.get(connectFrom)?.label}” · tap the canvas to cancel
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          className="w-8 h-8 grid place-items-center rounded-lg bg-ink-800/90 border border-ink-600 text-chalk-dim hover:text-chalk"
          onClick={() => setView(v => ({ ...v, k: Math.min(2, v.k * 1.18) }))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="w-8 h-8 grid place-items-center rounded-lg bg-ink-800/90 border border-ink-600 text-chalk-dim hover:text-chalk"
          onClick={() => setView(v => ({ ...v, k: Math.max(0.32, v.k / 1.18) }))}
          aria-label="Zoom out"
        >
          −
        </button>
      </div>

      {graph.nodes.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-chalk-faint text-sm">
          <span className="flex items-center gap-2">
            <Bot size={16} /> Empty graph — add a node to begin
          </span>
        </div>
      )}
    </div>
  );
}
