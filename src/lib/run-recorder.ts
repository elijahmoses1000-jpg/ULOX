// Record a run as a real video file.
//
// The share page replays a run live, which is better than a video for anyone
// who opens the link — but a video is what you can drop into a post, a slide
// or a DM. So the same frame the social card draws is animated step by step
// onto an offscreen canvas and captured with MediaRecorder.
//
// No encoder dependency: captureStream() + MediaRecorder is built into the
// browser. The trade-off is container support, which differs per browser, so
// the type is negotiated rather than assumed.

import { AgentGraph } from './agentic';
import { TraceStep } from './simulator';
import { KIND_HUE, fit, layout, roundRect, shareUrl } from './share-card';

const W = 1080;
const H = 1080;
const FPS = 30;

const INK = '#0E0F11';
const CHALK = '#E9EBEE';
const DIM = '#A5ABB3';
const FAINT = '#71777E';
const BRAND = '#EE1B24';

export interface RecordOptions {
  graph: AgentGraph;
  steps: TraceStep[];
  title: string;
  authorName: string;
  code: string;
  /** Seconds each step is held on screen. */
  holdPerStep?: number;
}

/** Containers in preference order; the first the browser admits is used. */
const CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function recorderSupported(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  const probe = document.createElement('canvas') as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  if (typeof probe.captureStream !== 'function') return false;
  return CANDIDATES.some(type => MediaRecorder.isTypeSupported(type));
}

function pickType(): string | null {
  return CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** A readable file extension for whatever container we ended up with. */
export function extensionFor(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('700 48px "Space Grotesk"'),
      document.fonts.load('500 24px Inter'),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back rather than fail the recording */
  }
}

/**
 * Draw one frame of the run.
 *
 * Everything before the current step is drawn as already-travelled, so the
 * path builds up on screen instead of one node flashing at a time.
 */
function drawFrame(ctx: CanvasRenderingContext2D, opts: RecordOptions, index: number, progress: number) {
  const { graph, steps, title, authorName, code } = opts;
  const step = steps[index];
  const visited = new Set(steps.slice(0, index + 1).map(s => s.nodeId));

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const hue = step ? KIND_HUE[step.kind] ?? '#4EA8FF' : '#4EA8FF';
  const wash = ctx.createRadialGradient(W - 140, 90, 0, W - 140, 90, 760);
  wash.addColorStop(0, `${hue}1F`);
  wash.addColorStop(1, '#00000000');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  const body = 'Inter, "Segoe UI", sans-serif';
  const display = '"Space Grotesk", Inter, sans-serif';

  ctx.textAlign = 'left';
  ctx.fillStyle = FAINT;
  ctx.font = `700 19px ${body}`;
  ctx.fillText('A RUN ON ULOX', 72, 92);
  ctx.fillStyle = CHALK;
  const titleSize = fit(ctx, title, W - 300, 52, 700, display);
  ctx.font = `700 ${titleSize}px ${display}`;
  ctx.fillText(title, 72, 150);
  ctx.fillStyle = DIM;
  ctx.font = `500 24px ${body}`;
  ctx.fillText(`by ${authorName}`, 72, 190);

  ctx.textAlign = 'right';
  ctx.fillStyle = hue;
  ctx.font = `700 54px ${display}`;
  ctx.fillText(String(index + 1), W - 72, 150);
  ctx.fillStyle = FAINT;
  ctx.font = `700 17px ${body}`;
  ctx.fillText(`OF ${steps.length}`, W - 72, 180);

  const box = { x: 56, y: 236, w: W - 112, h: 500 };
  ctx.fillStyle = '#131417';
  roundRect(ctx, box.x, box.y, box.w, box.h, 24);
  ctx.fill();
  ctx.strokeStyle = '#2B2E32';
  ctx.lineWidth = 2;
  ctx.stroke();

  const nodes = graph.nodes.slice(0, 40);
  if (nodes.length) {
    const at = layout(nodes, box);

    for (const edge of graph.edges) {
      const a = at.get(edge.source);
      const b = at.get(edge.target);
      if (!a || !b) continue;
      const live = visited.has(edge.source) && visited.has(edge.target);
      ctx.strokeStyle = live ? `${hue}99` : '#3A3E43';
      ctx.lineWidth = live ? 4 : 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.min(44, Math.abs(b.x - a.x) * 0.16);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }

    for (const node of nodes) {
      const p = at.get(node.id);
      if (!p) continue;
      const nodeHue = KIND_HUE[node.kind] ?? '#4EA8FF';
      const active = step?.nodeId === node.id;
      const seen = visited.has(node.id);
      const w = 150;
      const h = 54;

      if (active) {
        // A soft pulse, so the eye lands on the node that is executing.
        const scale = 1 + 0.12 * Math.sin(progress * Math.PI);
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = nodeHue;
        roundRect(ctx, p.x - (w * scale) / 2, p.y - (h * scale) / 2, w * scale, h * scale, 16);
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = active ? '#20242A' : '#1B1D21';
      roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 12);
      ctx.fill();
      ctx.strokeStyle = active ? nodeHue : seen ? `${nodeHue}AA` : '#33373C';
      ctx.lineWidth = active ? 3.5 : 2.5;
      ctx.stroke();

      ctx.fillStyle = active || seen ? nodeHue : '#4A4F55';
      ctx.beginPath();
      ctx.arc(p.x - w / 2 + 18, p.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = active || seen ? CHALK : '#6B7076';
      const labelSize = fit(ctx, node.label, w - 46, 18, 600, body);
      ctx.font = `600 ${labelSize}px ${body}`;
      ctx.fillText(node.label, p.x - w / 2 + 32, p.y + labelSize / 3);
    }
  }

  if (step) {
    ctx.textAlign = 'left';
    ctx.fillStyle = FAINT;
    ctx.font = `700 17px ${body}`;
    ctx.fillText(String(step.index + 1).padStart(2, '0'), 72, 800);
    ctx.fillStyle = hue;
    ctx.font = `700 25px ${body}`;
    ctx.fillText(step.label, 112, 800);

    ctx.fillStyle = DIM;
    ctx.font = `500 23px ${body}`;
    // Wrap the console line rather than letting it run off the frame.
    const maxWidth = W - 144;
    const words = step.line.split(' ');
    let lineText = '';
    let y = 838;
    for (const word of words) {
      const next = lineText ? `${lineText} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && lineText) {
        ctx.fillText(lineText, 72, y);
        y += 32;
        lineText = word;
        if (y > 902) break;
      } else {
        lineText = next;
      }
    }
    if (y <= 902) ctx.fillText(lineText, 72, y);
  }

  const done = (index + progress) / Math.max(1, steps.length);
  ctx.fillStyle = '#26282C';
  roundRect(ctx, 72, 944, W - 144, 6, 3);
  ctx.fill();
  ctx.fillStyle = hue;
  roundRect(ctx, 72, 944, Math.max(6, (W - 144) * done), 6, 3);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND;
  ctx.font = `600 24px ${body}`;
  ctx.fillText(shareUrl(code).replace(/^https?:\/\//, ''), 72, 1010);

  ctx.textAlign = 'right';
  ctx.font = `700 36px ${display}`;
  const markWidth = ctx.measureText('X').width;
  ctx.fillStyle = BRAND;
  ctx.fillText('X', W - 72, 1010);
  ctx.fillStyle = CHALK;
  ctx.fillText('Ulo', W - 72 - markWidth, 1010);
}

/**
 * Play the run onto a canvas and record it.
 *
 * Frames are paced by a timer rather than requestAnimationFrame: rAF is
 * throttled in a background tab, which would silently produce a video shorter
 * than the run it is supposed to show.
 */
export async function recordRun(opts: RecordOptions): Promise<{ blob: Blob; mime: string }> {
  const mime = pickType();
  if (!mime) throw new Error('This browser cannot record video');
  if (!opts.steps.length) throw new Error('There is no run to record');

  await ensureFonts();

  const canvas = document.createElement('canvas') as HTMLCanvasElement & {
    captureStream: (fps?: number) => MediaStream;
  };
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');

  drawFrame(ctx, opts, 0, 0);

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size) chunks.push(event.data);
  };

  const finished = new Promise<Blob>(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });

  recorder.start();

  const hold = opts.holdPerStep ?? 1.1;
  const framesPerStep = Math.max(2, Math.round(hold * FPS));
  const tail = FPS; // a beat on the last frame, so it works as a thumbnail

  for (let i = 0; i < opts.steps.length; i += 1) {
    for (let f = 0; f < framesPerStep; f += 1) {
      drawFrame(ctx, opts, i, f / framesPerStep);
      await new Promise(resolve => setTimeout(resolve, 1000 / FPS));
    }
  }
  for (let f = 0; f < tail; f += 1) {
    drawFrame(ctx, opts, opts.steps.length - 1, 1);
    await new Promise(resolve => setTimeout(resolve, 1000 / FPS));
  }

  recorder.stop();
  stream.getTracks().forEach(track => track.stop());
  return { blob: await finished, mime };
}
