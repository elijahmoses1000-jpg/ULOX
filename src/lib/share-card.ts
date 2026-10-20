// The image that travels.
//
// A link alone does not spread; a square card does. This draws the agent's
// actual topology — the real nodes and edges, laid out from their stored
// coordinates — so what gets posted is a picture of the thing the person
// built, not a generic badge with their name on it. The verification URL is
// baked in, so the card works even when a platform strips the link.
//
// Same approach as the certificate export: drawn from the record's own fields
// on a canvas, never screenshotted from the DOM, so it does not depend on the
// page's layout, scroll position or which fonts happened to be ready.

const W = 1080;
const H = 1080;

const INK = '#0E0F11';
const CHALK = '#E9EBEE';
const DIM = '#A5ABB3';
const FAINT = '#71777E';
const BRAND = '#EE1B24';

/** Matches KIND_META's palette in the app, so a card looks like the Lab. */
export const KIND_HUE: Record<string, string> = {
  entry: '#71777E',
  agent: '#4EA8FF',
  tool: '#3FD07A',
  guard: '#F5A524',
  memory: '#B57BFF',
  condition: '#9B7BFF',
  terminal: '#EE1B24',
};

export interface CardRecord {
  code: string;
  title: string;
  authorName: string;
  score: number;
  views: number;
  remixes: number;
  graph: {
    nodes: Array<{ id: string; kind: string; label: string; x: number; y: number }>;
    edges: Array<{ source: string; target: string }>;
  };
}

export function shareUrl(code: string): string {
  if (typeof window === 'undefined') return `/#/b/${code}`;
  return `${window.location.origin}${window.location.pathname}#/b/${code}`;
}

async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('700 64px "Space Grotesk"'),
      document.fonts.load('500 26px Inter'),
      document.fonts.load('700 26px Inter'),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back rather than fail the export */
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fit(ctx: CanvasRenderingContext2D, text: string, max: number, start: number, weight: number, family: string) {
  let px = start;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > max && px > 18) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

/**
 * Fit the graph into the panel from its own coordinates, preserving shape.
 * A single node, or a row of nodes with no vertical spread, would divide by
 * zero on a naive scale — hence the floor on each span.
 */
export function layout(nodes: CardRecord['graph']['nodes'], box: { x: number; y: number; w: number; h: number }) {
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1, Math.max(...xs) - minX);
  const spanY = Math.max(1, Math.max(...ys) - minY);
  const pad = 78;
  const scale = Math.min((box.w - pad * 2) / spanX, (box.h - pad * 2) / spanY, 1.5);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offX = box.x + (box.w - drawW) / 2;
  const offY = box.y + (box.h - drawH) / 2;
  const at = new Map<string, { x: number; y: number }>();
  for (const n of nodes) at.set(n.id, { x: offX + (n.x - minX) * scale, y: offY + (n.y - minY) * scale });
  return at;
}

export async function renderCard(record: CardRecord): Promise<HTMLCanvasElement> {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');

  const display = '"Space Grotesk", Inter, sans-serif';
  const body = 'Inter, "Segoe UI", sans-serif';
  const good = record.score >= 0;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const wash = ctx.createRadialGradient(W - 140, 90, 0, W - 140, 90, 760);
  wash.addColorStop(0, good ? '#3FD07A1F' : '#EE1B241F');
  wash.addColorStop(1, '#00000000');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // Engineering grid, the same gesture as the Lab canvas.
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

  // --- header ---
  ctx.textAlign = 'left';
  ctx.fillStyle = FAINT;
  ctx.font = `700 20px ${body}`;
  ctx.fillText('AGENT BUILT ON ULOX', 72, 96);

  const titleSize = fit(ctx, record.title, W - 300, 60, 700, display);
  ctx.fillStyle = CHALK;
  ctx.font = `700 ${titleSize}px ${display}`;
  ctx.fillText(record.title, 72, 162);

  ctx.fillStyle = DIM;
  ctx.font = `500 26px ${body}`;
  ctx.fillText(`by ${record.authorName}`, 72, 206);

  // Score, top-right — the one number that makes it a claim.
  ctx.textAlign = 'right';
  ctx.fillStyle = good ? '#3FD07A' : BRAND;
  ctx.font = `700 64px ${display}`;
  ctx.fillText(`${good ? '+' : ''}${record.score.toFixed(1)}`, W - 72, 150);
  ctx.fillStyle = FAINT;
  ctx.font = `700 17px ${body}`;
  ctx.fillText('EVAL SCORE', W - 72, 182);

  // --- the graph ---
  const box = { x: 56, y: 250, w: W - 112, h: 500 };
  ctx.fillStyle = '#131417';
  roundRect(ctx, box.x, box.y, box.w, box.h, 24);
  ctx.fill();
  ctx.strokeStyle = '#2B2E32';
  ctx.lineWidth = 2;
  ctx.stroke();

  const nodes = record.graph.nodes.slice(0, 40);
  if (nodes.length) {
    const at = layout(nodes, box);

    ctx.strokeStyle = '#3A3E43';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const e of record.graph.edges) {
      const a = at.get(e.source);
      const b = at.get(e.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      // A gentle curve keeps a return edge from hiding under the forward one.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.min(44, Math.abs(b.x - a.x) * 0.16);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }

    for (const n of nodes) {
      const p = at.get(n.id)!;
      const hue = KIND_HUE[n.kind] ?? '#4EA8FF';
      const w = 150;
      const h = 54;
      ctx.fillStyle = '#1B1D21';
      roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, 12);
      ctx.fill();
      ctx.strokeStyle = hue;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.arc(p.x - w / 2 + 18, p.y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = CHALK;
      const labelSize = fit(ctx, n.label, w - 46, 18, 600, body);
      ctx.font = `600 ${labelSize}px ${body}`;
      ctx.fillText(n.label, p.x - w / 2 + 32, p.y + labelSize / 3);
    }
  }

  // --- footer ---
  ctx.textAlign = 'left';
  ctx.fillStyle = DIM;
  ctx.font = `500 25px ${body}`;
  const counts = `${nodes.length} nodes · ${record.graph.edges.length} edges`;
  ctx.fillText(counts, 72, 820);
  if (record.remixes > 0) {
    ctx.fillStyle = FAINT;
    ctx.fillText(`· remixed ${record.remixes}×`, 76 + ctx.measureText(counts).width, 820);
  }

  ctx.fillStyle = CHALK;
  ctx.font = `700 34px ${display}`;
  ctx.fillText('Open it. Run it. Change it.', 72, 896);

  ctx.fillStyle = BRAND;
  ctx.font = `600 26px ${body}`;
  ctx.fillText(shareUrl(record.code).replace(/^https?:\/\//, ''), 72, 946);

  // Wordmark, bottom-right.
  ctx.textAlign = 'right';
  ctx.font = `700 40px ${display}`;
  const x = ctx.measureText('X').width;
  ctx.fillStyle = BRAND;
  ctx.fillText('X', W - 72, 946);
  ctx.fillStyle = CHALK;
  ctx.fillText('Ulo', W - 72 - x, 946);

  return canvas;
}

export function buildCardBlob(record: CardRecord): Promise<Blob> {
  return renderCard(record).then(
    canvas =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the card'))), 'image/jpeg', 0.94);
      }),
  );
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Hand the card to the OS share sheet where there is one. */
export async function shareBlob(blob: Blob, filename: string, title: string, url: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string; url?: string }) => Promise<void>;
  };
  if (!nav.share || !nav.canShare) return false;
  const file = new File([blob], filename, { type: 'image/jpeg' });
  if (!nav.canShare({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title, text: `${title}\nOpen it, run it, change it: ${url}` });
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return true;
    return false;
  }
}
