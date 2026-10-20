import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@appdeploy/client';
import { Copy, Eye, GitFork, Image, Play, Share2, Sparkles, Square, Video } from 'lucide-react';
import { AgentGraph } from '../lib/agentic';
import { MockInjection, simulate } from '../lib/simulator';
import { analyzeGraph } from '../lib/analyzer';
import { GraphCanvas } from '../components/GraphCanvas';
import { Card, Chip, Logo, useToast } from '../components/ui';
import { buildCardBlob, download, shareBlob, shareUrl } from '../lib/share-card';
import { RECORDING_SIZE, extensionFor, preferredFormat, recordRun, recorderSupported } from '../lib/run-recorder';

interface SharedRecord {
  code: string;
  title: string;
  note: string;
  authorName: string;
  origin: string;
  graph: AgentGraph;
  score: number;
  createdAt: number;
  views: number;
  remixes: number;
}

/** Same facts the Lab feeds a run, so the replay matches what the author saw. */
const LAB_FACTS = [
  'Superconducting qubits currently lead on gate fidelity.',
  'Trapped-ion systems win on coherence time.',
  'Error-corrected logical qubits were demonstrated at scale in 2024.',
  'Photonic approaches scale best at room temperature.',
];
/** One naming rule for every file this page hands out. */
const fileStem = (r: { title: string; code: string }) =>
  `${r.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ulox-agent'}-${r.code}`;

const mocksFor = (graph: AgentGraph): MockInjection[] =>
  graph.nodes.filter(n => n.kind === 'tool').flatMap(n => LAB_FACTS.map(data => ({ nodeId: n.id, status: 200, data })));

/**
 * A published build, open to anyone with the link.
 *
 * The run is not a recording. The simulator is deterministic, so the trace is
 * recomputed here from the graph — which means a visitor gets a live run they
 * can scrub and inspect rather than a video of someone else's screen, and a
 * share stays a few kilobytes.
 */
export function SharedBuild() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [record, setRecord] = useState<SharedRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [playhead, setPlayhead] = useState(0);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const canRecord = useMemo(() => recorderSupported(), []);
  const recFormat = useMemo(() => preferredFormat(), []);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/shares/${encodeURIComponent(code)}`)
      .then(res => {
        if (cancelled) return;
        if (res.data?.share) {
          setRecord(res.data.share);
          setState('ok');
        } else setState('missing');
      })
      .catch(() => !cancelled && setState('missing'));
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [code]);

  const sim = useMemo(() => (record ? simulate(record.graph, mocksFor(record.graph)) : null), [record]);
  // Recomputed rather than trusted from the record: the issue markers on the
  // canvas must describe the graph actually on screen.
  const report = useMemo(() => (record ? analyzeGraph(record.graph) : null), [record]);

  const play = useCallback(() => {
    if (!sim?.steps.length) return;
    if (timer.current) window.clearInterval(timer.current);
    setPlayhead(0);
    setRunning(true);
    let i = 0;
    timer.current = window.setInterval(() => {
      i += 1;
      if (i >= sim.steps.length) {
        setPlayhead(sim.steps.length - 1);
        setRunning(false);
        if (timer.current) window.clearInterval(timer.current);
        return;
      }
      setPlayhead(i);
    }, Math.max(110, Math.min(360, 2200 / sim.steps.length)));
  }, [sim]);

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    setRunning(false);
  };

  /** The loop: the only way to act on someone's build is to start building. */
  const remix = async () => {
    if (!record) return;
    // Credit the author. A failed count must never block the remix itself.
    try {
      await api.post(`/api/shares/${encodeURIComponent(record.code)}/remix`, {});
    } catch {
      /* the fork is what matters */
    }
    toast(`Opening ${record.title} in your Lab — it is yours to change.`, 'ok');
    // Hand the Lab the code rather than pushing a graph into the store and
    // navigating: the Lab loads its canvas from the URL, so a store write
    // would be overwritten the moment it mounts. Going through the URL also
    // means a forked Lab survives a refresh and can be linked to.
    navigate(`/lab?from=${encodeURIComponent(record.code)}`);
  };

  /**
   * Export the run itself, not a picture of it. The frames are drawn from the
   * same trace the page replays, so the file and the live page cannot show
   * different runs.
   */
  const exportRun = async (mode: 'share' | 'download') => {
    if (!record || !sim) return;
    setRecording(true);
    try {
      const { blob, mime } = await recordRun({
        graph: record.graph,
        steps: sim.steps,
        title: record.title,
        authorName: record.authorName,
        code: record.code,
      });
      const name = `${fileStem(record)}-run.${extensionFor(mime)}`;
      if (mode === 'share') {
        const shared = await shareBlob(blob, name, `${record.title} — a run on UloX`, shareUrl(record.code));
        if (!shared) {
          download(blob, name);
          toast('Sharing is not available here — the recording was downloaded instead.', 'info');
        }
      } else {
        download(blob, name);
        toast(
          `Recording downloaded — ${RECORDING_SIZE.width}×${RECORDING_SIZE.height} ${extensionFor(mime).toUpperCase()}`,
          'ok',
        );
      }
    } catch (err) {
      toast((err as Error)?.message || 'Could not record that run.', 'err');
    } finally {
      setRecording(false);
    }
  };

  const exportCard = async (mode: 'share' | 'download') => {
    if (!record) return;
    setBusy(true);
    try {
      const blob = await buildCardBlob(record);
      const name = `${fileStem(record)}.jpg`;
      if (mode === 'share') {
        const shared = await shareBlob(blob, name, `${record.title} — built on UloX`, shareUrl(record.code));
        if (!shared) {
          download(blob, name);
          toast('Sharing is not available here — the card was downloaded instead.', 'info');
        }
      } else {
        download(blob, name);
        toast('Card downloaded', 'ok');
      }
    } catch {
      toast('Could not build the card.', 'err');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return <div className="max-w-xl mx-auto px-4 py-20 text-center text-chalk-dim">Loading this build…</div>;
  }

  if (state === 'missing' || !record || !sim) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Sparkles size={26} className="mx-auto text-chalk-faint mb-3" />
        <h1 className="font-display text-xl font-bold">No published build with that code</h1>
        <p className="text-[13px] text-chalk-dim mt-2">It may have been removed, or the link may be mistyped.</p>
        <Link to="/explore" className="btn-primary mt-5">
          Browse UloX
        </Link>
      </div>
    );
  }

  const visited = playhead > 0 || running ? sim.steps.slice(0, playhead + 1).map(s => s.nodeId) : [];
  const activeNode = running || playhead > 0 ? sim.steps[playhead]?.nodeId ?? null : null;
  const step = sim.steps[playhead];

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 lg:py-8">
      <header className="flex items-start gap-3 flex-wrap mb-4">
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2 flex-wrap">
            <Chip tone="brand">shared build</Chip>
            {record.origin && <span className="text-[11px] text-chalk-faint uppercase tracking-wider">{record.origin}</span>}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-1.5">{record.title}</h1>
          <p className="text-[13px] text-chalk-dim mt-1">
            by <span className="text-chalk font-semibold">{record.authorName}</span>
            <span className="text-chalk-faint"> · </span>
            <span className="inline-flex items-center gap-1 text-chalk-faint">
              <Eye size={11} /> {record.views}
            </span>
            <span className="text-chalk-faint"> · </span>
            <span className="inline-flex items-center gap-1 text-chalk-faint">
              <GitFork size={11} /> {record.remixes} remixed
            </span>
          </p>
          {record.note && <p className="text-[13px] text-chalk mt-2.5 max-w-2xl leading-relaxed">{record.note}</p>}
        </div>
        <div
          className="shrink-0 text-right"
          title="How healthy this agent is, from -9.9 to +9.9"
        >
          <div
            className="font-display text-3xl font-bold tabular-nums"
            style={{ color: record.score >= 0 ? '#3FD07A' : '#EE1B24' }}
          >
            {record.score >= 0 ? '+' : ''}
            {record.score.toFixed(1)}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-chalk-faint">eval score</div>
        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="h-[46vh] min-h-[300px]">
          <GraphCanvas
            graph={record.graph}
            issues={report?.issues ?? []}
            selection={null}
            onSelect={() => undefined}
            onMoveNode={() => undefined}
            onConnect={() => undefined}
            activeNodeId={activeNode}
            visited={visited}
            readOnly
          />
        </div>

        <div className="border-t border-ink-700 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-ghost !text-xs" onClick={running ? stop : play}>
              {running ? <Square size={12} /> : <Play size={12} />} {running ? 'Stop' : 'Replay the run'}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, sim.steps.length - 1)}
              value={playhead}
              onChange={e => {
                stop();
                setPlayhead(Number(e.target.value));
              }}
              aria-label="Run step"
              className="grow min-w-[120px] accent-brand"
            />
            <span className="text-[11px] font-mono text-chalk-faint shrink-0">
              {sim.steps.length ? playhead + 1 : 0}/{sim.steps.length}
            </span>
          </div>
          {step && (
            <p className="text-[12px] font-mono text-chalk-dim mt-2.5 leading-relaxed">
              <span className="text-chalk-faint">{String(step.index + 1).padStart(2, '0')}</span>{' '}
              <span className="text-chalk">{step.label}</span>{' '}
              <span className="text-chalk-dim">{step.line}</span>
            </p>
          )}
          <p className="text-[11px] text-chalk-faint mt-2">
            Not a recording — the run is recomputed in your browser from the graph, so you can scrub it and open any
            node.
          </p>
        </div>
      </Card>

      <div className="flex items-center gap-2 flex-wrap mt-4">
        <button className="btn-primary !text-xs" onClick={remix}>
          <GitFork size={13} /> Open this in my Lab
        </button>
        <button className="btn-ghost !text-xs" onClick={() => exportCard('share')} disabled={busy}>
          <Share2 size={13} /> {busy ? 'Preparing…' : 'Share'}
        </button>
        <button className="btn-ghost !text-xs" onClick={() => exportCard('download')} disabled={busy}>
          <Image size={13} /> Card
        </button>
        {canRecord && (
          <button
            className="btn-ghost !text-xs"
            onClick={() => exportRun('download')}
            disabled={recording || !sim.steps.length}
            title={`Save the run as a ${RECORDING_SIZE.width}×${RECORDING_SIZE.height} ${(recFormat ?? 'video').toUpperCase()} file`}
          >
            <Video size={13} />{' '}
            {recording ? 'Recording the run…' : `Save the run (${(recFormat ?? '').toUpperCase()})`}
          </button>
        )}
        <button
          className="btn-quiet !text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl(record.code));
              toast('Link copied', 'ok');
            } catch {
              toast(shareUrl(record.code), 'info');
            }
          }}
        >
          <Copy size={13} /> Copy link
        </button>
      </div>

      {/* The one line that has to convert a stranger. */}
      <Card className="p-4 mt-5 flex items-center gap-3 flex-wrap">
        <Logo size={22} />
        <p className="text-[13px] text-chalk-dim grow min-w-[200px]">
          This was built on <span className="text-chalk font-semibold">UloX</span> — you learn agentic engineering by
          repairing broken agent systems, then building your own.
        </p>
        <Link to="/" className="btn-ghost !text-xs shrink-0">
          Start free
        </Link>
      </Card>
    </div>
  );
}
