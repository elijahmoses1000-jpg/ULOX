// Certificate export.
//
// Both downloads come from one canvas: the JPG *is* the PDF's only content, so
// the two can never drift apart. Printing from the browser is still there for
// anyone who wants it, but a learner posting to LinkedIn needs a file, and
// "print to PDF" produces a different artefact on every OS.
//
// Nothing here is a screenshot of the DOM — the certificate is drawn from the
// record's own fields, so the export does not depend on the page's layout,
// scroll position, device pixel ratio, or which fonts happened to be ready.

export interface CertificateData {
  code: string;
  name: string;
  track: string;
  trackTitle: string;
  issuedAt: number;
  evidence: { topics: number; drills: number; built: boolean; ratingAtIssue: number };
}

/** A4 landscape at ~170dpi: large enough to print cleanly, small enough to post. */
const W = 2000;
const H = 1414;

const INK = '#0E0F11';
const MUTED = '#6B7280';
const FAINT = '#9AA1AA';
const BRAND = '#EE1B24';

/** A4 landscape in PostScript points, so the PDF prints at the right size. */
const PAGE_W = 841.89;
const PAGE_H = 595.28;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw centred text, shrinking the size until it fits. A certificate has to
 * hold whatever name it is given — long double-barrelled names are normal, and
 * overflowing one off the edge of the card is not an acceptable failure.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  startPx: number,
  weight: number,
  family: string,
) {
  let px = startPx;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > 20) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  ctx.fillText(text, cx, y);
  return px;
}

/** Canvas letter-spacing is not in every engine yet; fall back to manual kerning. */
function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
) {
  // Read through a widened alias: narrowing on `ctx` itself would make the
  // fallback branch unreachable, because the DOM lib does not declare the
  // property that newer engines actually ship.
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof spaced.letterSpacing === 'string') {
    spaced.letterSpacing = `${spacing}px`;
    ctx.fillText(text, cx, y);
    spaced.letterSpacing = '0px';
    return;
  }
  const chars = [...text];
  const total = chars.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, 0) - spacing;
  let x = cx - total / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const c of chars) {
    ctx.fillText(c, x, y);
    x += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
}

/**
 * Make sure the display faces are actually rasterised before drawing. Canvas
 * silently falls back to a default face for a font that has not loaded, which
 * would ship a certificate in Times New Roman.
 */
async function ensureFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('700 100px "Space Grotesk"'),
      document.fonts.load('500 32px Inter'),
      document.fonts.load('700 32px Inter'),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back to whatever is available rather than failing the export */
  }
}

export async function renderCertificate(cert: CertificateData, hue: string): Promise<HTMLCanvasElement> {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');

  const display = '"Space Grotesk", Inter, sans-serif';
  const body = 'Inter, "Segoe UI", sans-serif';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // A wash of the discipline's colour, the same gesture as the on-screen card.
  const wash = ctx.createRadialGradient(W - 180, 120, 0, W - 180, 120, 900);
  wash.addColorStop(0, `${hue}24`);
  wash.addColorStop(1, `${hue}00`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = hue;
  ctx.lineWidth = 10;
  roundRect(ctx, 70, 70, W - 140, H - 140, 36);
  ctx.stroke();

  ctx.strokeStyle = `${hue}59`;
  ctx.lineWidth = 2;
  roundRect(ctx, 96, 96, W - 192, H - 192, 22);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Wordmark. "Ulo" in ink, "X" in the brand red, as in the logo.
  ctx.font = `700 76px ${display}`;
  const ulo = ctx.measureText('Ulo').width;
  const x = ctx.measureText('X').width;
  const startX = W / 2 - (ulo + x) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.fillText('Ulo', startX, 252);
  ctx.fillStyle = BRAND;
  ctx.fillText('X', startX + ulo, 252);

  ctx.textAlign = 'center';
  ctx.fillStyle = FAINT;
  ctx.font = `700 22px ${body}`;
  tracked(ctx, 'BY VERIONX', W / 2, 296, 7);

  ctx.fillStyle = MUTED;
  ctx.font = `700 27px ${body}`;
  tracked(ctx, 'CERTIFICATE OF COMPLETION', W / 2, 432, 9);

  ctx.fillStyle = hue;
  fitText(ctx, cert.trackTitle, W / 2, 566, W - 420, 112, 700, display);

  ctx.fillStyle = MUTED;
  ctx.font = `400 32px ${body}`;
  ctx.fillText('awarded to', W / 2, 664);

  ctx.fillStyle = INK;
  fitText(ctx, cert.name, W / 2, 782, W - 380, 92, 700, display);

  // Evidence, as counted by the server when the certificate was issued.
  const bits = [
    `${cert.evidence.topics} topics read`,
    `${cert.evidence.drills} broken systems fixed`,
    'built from scratch',
  ];
  ctx.font = `500 30px ${body}`;
  const gap = 64;
  const widths = bits.map(b => ctx.measureText(b).width + 38);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (bits.length - 1);
  let bx = W / 2 - totalW / 2;
  ctx.textAlign = 'left';
  bits.forEach((bit, i) => {
    ctx.strokeStyle = hue;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + 2, 872);
    ctx.lineTo(bx + 11, 881);
    ctx.lineTo(bx + 26, 862);
    ctx.stroke();
    ctx.fillStyle = '#3F454C';
    ctx.fillText(bit, bx + 38, 882);
    bx += widths[i] + gap;
  });

  ctx.strokeStyle = '#E3E6EA';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(180, 1000);
  ctx.lineTo(W - 180, 1000);
  ctx.stroke();

  const issued = new Date(cert.issuedAt).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const columns: Array<[string, string, string]> = [
    ['ISSUED', issued, INK],
    ['RATING AT ISSUE', String(cert.evidence.ratingAtIssue), INK],
    ['VERIFICATION CODE', cert.code, hue],
  ];
  const colX = [180, W / 2 - 120, W - 180 - 340];
  columns.forEach(([label, value, colour], i) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = FAINT;
    ctx.font = `700 20px ${body}`;
    tracked(ctx, label, colX[i], 1074, 3);
    ctx.textAlign = 'left';
    ctx.fillStyle = colour;
    ctx.font = `700 34px ${i === 2 ? '"Space Grotesk", monospace' : body}`;
    ctx.fillText(value, colX[i], 1122);
  });

  // Anyone holding the image can check it without being told how.
  ctx.textAlign = 'center';
  ctx.fillStyle = FAINT;
  ctx.font = `400 24px ${body}`;
  ctx.fillText(`Verify at ${verifyUrl(cert.code)}`, W / 2, 1248);
  ctx.font = `400 21px ${body}`;
  ctx.fillText(
    'A certificate of completion issued by UloX. Not an accredited qualification.',
    W / 2,
    1292,
  );

  return canvas;
}

export function verifyUrl(code: string): string {
  if (typeof window === 'undefined') return `/#/verify/${code}`;
  return `${window.location.origin}${window.location.pathname}#/verify/${code}`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.94): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * A one-page PDF wrapping the JPEG. Writing the handful of objects by hand is
 * about sixty lines; pulling in a PDF library for this would add hundreds of
 * kilobytes to every page load so a few people can download a certificate.
 */
function buildPdf(jpeg: Uint8Array, pxW: number, pxH: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const startObject = () => offsets.push(length);

  // Fit the image inside the page, preserving its aspect ratio.
  const scale = Math.min(PAGE_W / pxW, PAGE_H / pxH);
  const drawW = pxW * scale;
  const drawH = pxH * scale;
  const offX = (PAGE_W - drawW) / 2;
  const offY = (PAGE_H - drawH) / 2;

  push('%PDF-1.4\n');

  startObject();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject();
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject();
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  );

  startObject();
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push('\nendstream\nendobj\n');

  const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${offX.toFixed(2)} ${offY.toFixed(2)} cm /Im0 Do Q\n`;
  startObject();
  push(`5 0 obj\n<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefAt = length;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export function fileStem(cert: CertificateData): string {
  const who = cert.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'UloX';
  const what = cert.trackTitle.replace(/[^A-Za-z0-9]+/g, '-');
  return `${who}-${what}-${cert.code}`;
}

export async function certificateBlobs(cert: CertificateData, hue: string) {
  const canvas = await renderCertificate(cert, hue);
  const jpeg = await canvasToJpeg(canvas);
  const pdf = buildPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
  return { jpeg, pdf, canvas };
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Hand the image to the OS share sheet when there is one — that is the path to
 * WhatsApp, X, LinkedIn and the rest on a phone. Returns false when sharing a
 * file is not available, so the caller can fall back to a download.
 */
export async function shareCertificate(cert: CertificateData, jpeg: Blob): Promise<boolean> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string; url?: string }) => Promise<void>;
  };
  if (!nav.share || !nav.canShare) return false;

  const file = new File([jpeg], `${fileStem(cert)}.jpg`, { type: 'image/jpeg' });
  if (!nav.canShare({ files: [file] })) return false;

  try {
    await nav.share({
      files: [file],
      title: `${cert.trackTitle} — UloX`,
      text: `I completed ${cert.trackTitle} on UloX. Verify: ${verifyUrl(cert.code)}`,
    });
    return true;
  } catch (err) {
    // A cancelled share is not a failure; anything else falls back.
    if ((err as { name?: string })?.name === 'AbortError') return true;
    return false;
  }
}
