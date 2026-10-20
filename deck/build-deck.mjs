// VerionX / UloX investor deck — one model, two renderers.
//
// Every slide is a flat list of three primitives: rect, text and line. The PDF
// renderer and the PPTX renderer each implement only those three, so the two
// files cannot drift from each other — which is the whole reason the content
// is not written twice.
//
// Coordinates are PostScript points on a 960x540 canvas (16:9). PowerPoint
// works in inches, so the PPTX renderer divides by 72.
//
//   node build-deck.mjs <outDir>

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';

const W = 960;
const H = 540;
const M = 56;

// VerionX brand: the red carries identity, everything else gets out of its way.
const BRAND = '#EE1B24';
const INK = '#0E0F11';
const PANEL = '#17181B';
const PANEL2 = '#1E2024';
const LINE = '#2B2E32';
const CHALK = '#FFFFFF';
const DIM = '#A5ABB3';
const FAINT = '#71777E';

// The six disciplines, in UloX's own order and colours.
const LADDER = ['#3FD07A', '#52C98B', '#4EA8FF', '#7B8EFF', '#9B7BFF', '#B57BFF'];
const GOLD = '#F5A524';

const HEAD = 'Arial';
const BODY = 'Arial';

const URL = 'www.ulox.verionx.org';

// --- primitive helpers ------------------------------------------------------

const rect = (x, y, w, h, fill, r = 0) => ({ t: 'rect', x, y, w, h, fill, r });
const line = (x1, y1, x2, y2, color, w = 1) => ({ t: 'line', x1, y1, x2, y2, color, w });
const text = (x, y, w, s, o = {}) => ({
  t: 'text',
  x,
  y,
  w,
  s,
  size: o.size ?? 12,
  bold: !!o.bold,
  color: o.color ?? CHALK,
  align: o.align ?? 'left',
  lh: o.lh ?? 1.25,
  spacing: o.spacing ?? 0,
  font: o.font ?? BODY,
});

/** Section kicker + headline, used on every interior slide. */
function head(kicker, title, opts = {}) {
  const ops = [];
  if (kicker) {
    ops.push(text(M, 46, W - M * 2, kicker.toUpperCase(), { size: 10.5, bold: true, color: BRAND, spacing: 1.6 }));
  }
  ops.push(text(M, 68, opts.titleW ?? W - M * 2, title, { size: opts.size ?? 30, bold: true, font: HEAD, lh: 1.14 }));
  return ops;
}

/** The thin rule + page furniture at the foot of every interior slide. */
function foot(n) {
  return [
    line(M, H - 44, W - M, H - 44, LINE, 1),
    text(M, H - 36, 400, 'VerionX  ·  UloX', { size: 9, color: FAINT, spacing: 0.6 }),
    text(W - M - 300, H - 36, 300, `${URL}   ${String(n).padStart(2, '0')}`, { size: 9, color: FAINT, align: 'right' }),
  ];
}

/** Evenly spaced columns inside the content area. */
function cols(count, gap = 18, left = M, right = W - M) {
  const total = right - left;
  const w = (total - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: left + i * (w + gap), w }));
}

/** A statistic with its label underneath. */
function stat(x, y, w, value, label, color = CHALK, size = 34) {
  return [
    text(x, y, w, value, { size, bold: true, font: HEAD, color }),
    text(x, y + size + 6, w, label, { size: 10, color: DIM, lh: 1.3 }),
  ];
}

/** A bordered card. */
function card(x, y, w, h, fill = PANEL) {
  return [rect(x, y, w, h, fill, 8), rect(x, y, 3, h, LINE, 0)];
}

// --- slides -----------------------------------------------------------------

const slides = [];

// 1 — Cover
slides.push({
  notes:
    'VerionX exists to equip people with know-how to maximise their potential. Two products, one ladder: Ulo builds the foundation, UloX builds the frontier skill — agentic engineering.',
  ops: [
    rect(0, 0, W, H, INK),
    rect(0, 0, 6, H, BRAND),
    text(M, 120, 520, 'VerionX', { size: 15, bold: true, color: BRAND, spacing: 2.4 }),
    text(M, 156, 640, 'Building the workforce', { size: 54, bold: true, font: HEAD, lh: 1.06 }),
    text(M, 212, 640, 'for the future.', { size: 54, bold: true, font: HEAD, lh: 1.06, color: BRAND }),
    text(M, 300, 560, 'We exist to equip people with know-how to maximise their potential on earth.', {
      size: 15,
      color: DIM,
      lh: 1.5,
    }),
    line(M, 356, M + 120, 356, BRAND, 2),
    text(M, 378, 560, 'UloX — mastering the utility of AI', { size: 17, bold: true, font: HEAD }),
    text(M, 404, 560, 'The agentic engineering trainer. Live now.', { size: 12, color: DIM }),
    text(M, 452, 560, URL, { size: 12, bold: true, color: BRAND }),
    // Discipline ladder as a brand device.
    ...LADDER.map((c, i) => rect(W - M - 6 - (LADDER.length - 1 - i) * 34, 120, 22, 300, c, 3)),
    text(W - M - 220, 440, 220, 'Six disciplines. One ladder.', { size: 10, color: FAINT, align: 'right' }),
    text(W - M - 220, 456, 220, 'Prompt → Agentic engineering', { size: 10, color: FAINT, align: 'right' }),
  ],
});

// 2 — The shift
slides.push({
  notes:
    'The capability gap has moved. Access to AI is solved; reliability is not. That is the gap UloX is built for.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('01 — The shift', 'Everyone can call a model.\nAlmost nobody can make one reliable.'),
    ...(() => {
      const c = cols(3);
      const out = [];
      const items = [
        ['Access is solved', 'A model is three lines of code and a key. The hard part moved somewhere else.', BRAND],
        ['Reliability is not', 'Agents stall, loop, leak and overspend. Most teams find out in production.', GOLD],
        ['Nobody is teaching it', 'Courses stop at the prompt. The other five disciplines go untaught.', LADDER[2]],
      ];
      items.forEach(([t, b, col], i) => {
        out.push(...card(c[i].x, 196, c[i].w, 128));
        out.push(rect(c[i].x, 196, 3, 128, col, 0));
        out.push(text(c[i].x + 20, 216, c[i].w - 40, t, { size: 15, bold: true, font: HEAD, color: col }));
        out.push(text(c[i].x + 20, 244, c[i].w - 40, b, { size: 11, color: DIM, lh: 1.45 }));
      });
      return out;
    })(),
    rect(M, 348, W - M * 2, 98, PANEL2, 8),
    text(M + 24, 368, 300, 'THE COST OF GETTING IT WRONG', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    ...(() => {
      const c = cols(3, 18, M + 24, W - M - 24);
      return [
        ...stat(c[0].x, 390, c[0].w, '6', 'disciplines behind a reliable agent', CHALK, 28),
        ...stat(c[1].x, 390, c[1].w, '1', 'of them is what most training covers', BRAND, 28),
        ...stat(c[2].x, 390, c[2].w, '18', 'ways an agent breaks, each drilled in UloX', LADDER[0], 28),
      ];
    })(),
    ...foot(2),
  ],
});

// 3 — Mission and vision
slides.push({
  notes: 'The mission and vision are the spine. Every product decision answers to them.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('02 — Why VerionX exists', 'One mission. One vision.\nTwo products that serve both.'),
    rect(M, 190, (W - M * 2 - 20) / 2, 150, PANEL, 8),
    rect(M, 190, 3, 150, BRAND, 0),
    text(M + 24, 210, 360, 'MISSION', { size: 9.5, bold: true, color: BRAND, spacing: 1.4 }),
    text(M + 24, 232, (W - M * 2 - 20) / 2 - 48, 'We exist to equip people with know-how to maximise their potential on earth.', {
      size: 15,
      bold: true,
      font: HEAD,
      lh: 1.35,
    }),
    rect(M + (W - M * 2 - 20) / 2 + 20, 190, (W - M * 2 - 20) / 2, 150, PANEL, 8),
    rect(M + (W - M * 2 - 20) / 2 + 20, 190, 3, 150, LADDER[3], 0),
    text(M + (W - M * 2 - 20) / 2 + 44, 210, 360, 'VISION', { size: 9.5, bold: true, color: LADDER[3], spacing: 1.4 }),
    text(M + (W - M * 2 - 20) / 2 + 44, 232, (W - M * 2 - 20) / 2 - 48, 'Building the workforce for the future.', {
      size: 15,
      bold: true,
      font: HEAD,
      lh: 1.35,
    }),
    text(M, 372, W - M * 2, 'HOW THAT BECOMES PRODUCT', { size: 9.5, bold: true, color: FAINT, spacing: 1.3 }),
    ...(() => {
      const c = cols(2, 20);
      return [
        ...card(c[0].x, 394, c[0].w, 70),
        text(c[0].x + 20, 410, c[0].w - 40, 'Ulo — the foundation', { size: 13, bold: true, font: HEAD, color: GOLD }),
        text(c[0].x + 20, 432, c[0].w - 40, 'Gamified learning for school-age Nigeria. Learn, play, practise, prove, earn.', { size: 10.5, color: DIM, lh: 1.4 }),
        ...card(c[1].x, 394, c[1].w, 70),
        text(c[1].x + 20, 410, c[1].w - 40, 'UloX — the frontier', { size: 13, bold: true, font: HEAD, color: BRAND }),
        text(c[1].x + 20, 432, c[1].w - 40, 'Agentic engineering for the people who will build and run AI systems.', { size: 10.5, color: DIM, lh: 1.4 }),
      ];
    })(),
    ...foot(3),
  ],
});

// 4 — The capability ladder
slides.push({
  notes:
    'One continuous ladder from a child in a Nigerian classroom to an engineer shipping agents. Ulo and UloX are two rungs of the same system, not two companies.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('03 — The VerionX system', 'One ladder, from first lesson\nto shipping an AI system.'),
    ...(() => {
      const out = [];
      const stages = [
        ['LEARN', 'Ulo', 'Lessons become play'],
        ['PRACTISE', 'Ulo', 'Challenges and streaks'],
        ['PROVE', 'Ulo', 'Skill, not completion'],
        ['BUILD', 'UloX', 'Repair broken agents'],
        ['SHIP', 'UloX', 'Bounded, observable systems'],
      ];
      const c = cols(5, 14);
      stages.forEach(([k, product, body], i) => {
        const col = i < 3 ? GOLD : BRAND;
        out.push(rect(c[i].x, 196, c[i].w, 112, PANEL, 8));
        out.push(rect(c[i].x, 196, c[i].w, 4, col, 0));
        out.push(text(c[i].x + 14, 214, c[i].w - 28, k, { size: 12.5, bold: true, font: HEAD, color: col }));
        out.push(text(c[i].x + 14, 234, c[i].w - 28, product, { size: 9, bold: true, color: FAINT, spacing: 1 }));
        out.push(text(c[i].x + 14, 254, c[i].w - 28, body, { size: 10, color: DIM, lh: 1.4 }));
        if (i < 4) out.push(text(c[i].x + c[i].w + 1, 244, 12, '›', { size: 15, color: FAINT }));
      });
      return out;
    })(),
    rect(M, 336, W - M * 2, 112, PANEL2, 8),
    text(M + 24, 356, 520, 'WHAT HOLDS THE TWO TOGETHER', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    text(M + 24, 378, 420, 'ITOLS', { size: 26, bold: true, font: HEAD, color: BRAND }),
    text(M + 24, 412, 440, 'A proprietary VerionX framework for writing an AI instruction you can actually test.', {
      size: 11,
      color: DIM,
      lh: 1.4,
    }),
    text(W - M - 380, 378, 356, 'Ulo teaches people to learn. UloX teaches people to build. ITOLS is the common grammar underneath both — the thing a learner carries from one to the other.', {
      size: 11,
      color: DIM,
      lh: 1.5,
      align: 'right',
    }),
    ...foot(4),
  ],
});

// 5 — UloX, what it is
slides.push({
  notes:
    'The chess analogy is the fastest way in: you do not learn chess by reading about chess. UloX hands you broken systems and a real engine that scores your repair.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('04 — UloX', 'You do not learn chess by\nreading about chess.'),
    text(M, 160, 620, 'UloX hands you agent systems that are already broken, and asks you to repair them.', {
      size: 13,
      color: DIM,
      lh: 1.5,
    }),
    ...(() => {
      const out = [];
      const items = [
        ['Tactics, not quizzes', 'Each drill is a real agent graph with a real fault: an unbounded loop, a router with two matching branches, a guard that logs and lets it through.'],
        ['A search engine scores you', 'A beam search looks for the repair too, so the hint is the first move of a solution it actually found — not a sentence someone pre-wrote.'],
        ['A simulator decides truth', 'Every fix is executed. "Did it work" is a fact, not an opinion.'],
        ['Rated, like chess', 'Glicko-2 ratings move on what you actually solved, in single player and in rated matches against other engineers.'],
      ];
      const c = cols(2, 20);
      items.forEach(([t, b], i) => {
        const x = c[i % 2].x;
        const y = 206 + Math.floor(i / 2) * 118;
        out.push(...card(x, y, c[0].w, 104));
        out.push(rect(x, y, 3, 104, LADDER[i], 0));
        out.push(text(x + 20, y + 18, c[0].w - 40, t, { size: 14, bold: true, font: HEAD }));
        out.push(text(x + 20, y + 42, c[0].w - 40, b, { size: 10.5, color: DIM, lh: 1.45 }));
      });
      return out;
    })(),
    ...foot(5),
  ],
});

// 6 — ITOLS (the centrepiece)
slides.push({
  notes:
    'ITOLS is the IP. Five layers, three sub-layers each — fifteen checkable things where there used to be a paragraph of hope. Created by Elijah Moses; proprietary to VerionX.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('05 — The framework', 'ITOLS', { size: 34 }),
    text(M + 108, 78, 460, 'Five layers that turn a prompt into a contract you can test.', {
      size: 13,
      color: DIM,
      lh: 1.4,
    }),
    text(W - M - 250, 50, 250, 'A PROPRIETARY VERIONX FRAMEWORK', { size: 9, bold: true, color: BRAND, align: 'right', spacing: 1.1 }),
    text(W - M - 250, 64, 250, 'Created by Elijah Moses', { size: 9, color: FAINT, align: 'right' }),
    ...(() => {
      const out = [];
      const rows = [
        ['I', 'Identity', 'Who the agent is', ['Authenticity', 'Authority', 'Affirmation']],
        ['T', 'Tasks', 'What it must do', ['Context', 'Content', 'Audience / Object']],
        ['O', 'Outcome', 'What finished looks like', ['Fact', 'Flow', 'Synthesis']],
        ['L', 'Language', 'How it must speak', ['Clarity', 'Composure', 'Tone']],
        ['S', 'Security', 'What it must never do', ['Guardrail', 'Control', 'Balance']],
      ];
      const top = 136;
      const rh = 64;
      rows.forEach(([letter, name, meaning, subs], i) => {
        const y = top + i * rh;
        const col = LADDER[i];
        out.push(rect(M, y, W - M * 2, rh - 8, PANEL, 6));
        out.push(rect(M, y, 4, rh - 8, col, 0));
        out.push(rect(M + 18, y + 13, 32, 32, col, 6));
        out.push(text(M + 18, y + 20, 32, letter, { size: 16, bold: true, font: HEAD, color: INK, align: 'center' }));
        out.push(text(M + 62, y + 14, 150, name, { size: 15, bold: true, font: HEAD, color: col }));
        out.push(text(M + 62, y + 35, 180, meaning, { size: 10, color: DIM }));
        const cx = M + 262;
        const cw = (W - M - 20 - cx) / 3;
        subs.forEach((s, j) => {
          out.push(rect(cx + j * cw, y + 15, cw - 12, 28, PANEL2, 5));
          out.push(text(cx + j * cw, y + 23, cw - 12, s, { size: 11, bold: true, align: 'center' }));
        });
      });
      return out;
    })(),
    text(M, 462, W - M * 2, 'Fifteen checkable fields where there used to be a paragraph of hope — taught, drilled and scored inside UloX.', {
      size: 10.5,
      color: DIM,
      lh: 1.4,
    }),
    ...foot(6),
  ],
});

// 7 — How UloX teaches
slides.push({
  notes: 'The learning loop, and the integrity model behind the certificate.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('06 — How it teaches', 'Read it. Fix it. Build it.\nThen prove it.'),
    ...(() => {
      const out = [];
      const steps = [
        ['READ', 'A short idea, in plain words at your level.'],
        ['FIX', 'A broken system, repaired in a bounded number of moves.'],
        ['BUILD', 'The same pattern, built from nothing, graded by the simulator.'],
        ['PROVE', 'A certificate with a code anyone can verify.'],
      ];
      const c = cols(4, 16);
      steps.forEach(([k, b], i) => {
        out.push(rect(c[i].x, 192, c[i].w, 96, PANEL, 8));
        out.push(rect(c[i].x, 192, c[i].w, 4, LADDER[i * 2] ?? BRAND, 0));
        out.push(text(c[i].x + 16, 210, c[i].w - 32, k, { size: 13, bold: true, font: HEAD, color: LADDER[i * 2] ?? BRAND }));
        out.push(text(c[i].x + 16, 232, c[i].w - 32, b, { size: 10, color: DIM, lh: 1.4 }));
      });
      return out;
    })(),
    rect(M, 312, W - M * 2, 136, PANEL2, 8),
    text(M + 24, 332, 520, 'THE PART COMPETITORS CANNOT COPY QUICKLY', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    ...(() => {
      const c = cols(3, 20, M + 24, W - M - 24);
      const items = [
        ['Proved content', 'Every drill is machine-checked: solvable inside its move limit, not already solved, and findable by the hint the app actually gives.'],
        ['Earned certificates', 'Requirements are re-derived on the server before anything is issued. The build step cannot be self-declared.'],
        ['A distribution loop', 'Finish a build, publish it, and anyone can open the link, replay the run and fork it into their own Lab.'],
      ];
      const out = [];
      items.forEach(([t, b], i) => {
        out.push(text(c[i].x, 356, c[i].w, t, { size: 12.5, bold: true, font: HEAD, color: LADDER[i + 1] }));
        out.push(text(c[i].x, 378, c[i].w, b, { size: 10, color: DIM, lh: 1.45 }));
      });
      return out;
    })(),
    ...foot(7),
  ],
});

// 8 — Proof
slides.push({
  notes:
    'Ulo traction is real and already counted. UloX platform depth is what is shipped and verifiable today at the URL.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('07 — Proof', 'We are past the idea stage.'),
    text(M, 126, 560, 'ULO — REACH ALREADY BUILT', { size: 9.5, bold: true, color: GOLD, spacing: 1.3 }),
    ...(() => {
      const c = cols(5, 14);
      const items = [
        ['80,000', 'students engaged in 10 months'],
        ['40', 'secondary schools activated'],
        ['7', 'universities engaged'],
        ['1.2M+', 'teachers reached via Nigeria Teachers'],
        ['100+', 'student ambassadors'],
      ];
      return items.flatMap(([v, l], i) => stat(c[i].x, 150, c[i].w, v, l, GOLD, 26));
    })(),
    line(M, 236, W - M, 236, LINE, 1),
    text(M, 252, 560, 'ULOX — WHAT IS LIVE TODAY', { size: 9.5, bold: true, color: BRAND, spacing: 1.3 }),
    ...(() => {
      const c = cols(5, 14);
      const items = [
        ['18', 'drills, each machine-proved solvable'],
        ['6', 'disciplines, with guided builds'],
        ['94', 'roadmaps, pulled live from source'],
        ['250', 'glossary terms, alias-aware'],
        ['154', 'one-page field notes'],
      ];
      return items.flatMap(([v, l], i) => stat(c[i].x, 276, c[i].w, v, l, BRAND, 26));
    })(),
    rect(M, 366, W - M * 2, 82, PANEL, 8),
    text(M + 24, 386, 300, 'PARTNERS AND PROGRAMMES', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    text(M + 24, 408, W - M * 2 - 48, 'Federal Government — co-partner on the national refugee re-skilling programme  ·  Nigeria Teachers (1.2M+ members)  ·  UNILAG · FUTO · UNICAL · LASU · UNIBEN · Bauchi State University  ·  10 AI labs being set up in schools', {
      size: 10.5,
      color: DIM,
      lh: 1.45,
    }),
    ...foot(8),
  ],
});

// 9 — Market and timing
slides.push({
  notes: 'Two markets stacked: the EdTech base Ulo already sells into, and the AI-skills gap UloX is built for.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('08 — Market and timing', 'A young continent, and a skill\nthe world has not taught yet.'),
    ...(() => {
      const c = cols(4, 16);
      const items = [
        ['$10B', "Africa's EdTech market by 2026", 'HolonIQ', GOLD],
        ['65M', 'students in Nigeria alone', 'UNESCO', GOLD],
        ['70%', 'of Nigerians are under 30', 'UN DESA / NBS', GOLD],
        ['98M', 'children and youth out of school in sub-Saharan Africa', 'UNESCO', BRAND],
      ];
      return items.flatMap(([v, l, src, col], i) => [
        ...card(c[i].x, 176, c[i].w, 128),
        rect(c[i].x, 176, 3, 128, col, 0),
        ...stat(c[i].x + 18, 196, c[i].w - 36, v, l, col, 30),
        text(c[i].x + 18, 272, c[i].w - 36, src, { size: 8.5, color: FAINT, spacing: 0.8 }),
      ]);
    })(),
    rect(M, 326, W - M * 2, 120, PANEL2, 8),
    text(M + 24, 346, 520, 'WHY NOW', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    text(M + 24, 368, (W - M * 2) / 2 - 40, 'Every company is being told to add AI. Almost none of them have anyone who can make an agent behave under failure, attack or cost pressure.', {
      size: 11.5,
      color: DIM,
      lh: 1.5,
    }),
    text(W / 2 + 12, 368, (W - M * 2) / 2 - 40, 'UloX is free to learn on, in the browser, and already live. The market path is the one Ulo has already walked: Nigeria → West Africa → Africa → emerging markets.', {
      size: 11.5,
      color: DIM,
      lh: 1.5,
    }),
    ...foot(9),
  ],
});

// 10 — Roadmap and the ask
slides.push({
  notes: 'The ask is unchanged in size; this slide shows where UloX sits inside it.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('09 — Roadmap and the ask', 'From a launched product\nto a scalable platform.'),
    ...(() => {
      const c = cols(3, 18);
      const phases = [
        ['PHASE 1 · 0–12 MONTHS', 'Optimise', 'Open the first learning hub · deepen the gamification engine · ship the agentic curriculum · prove engagement'],
        ['PHASE 2 · 12–24 MONTHS', 'Monetise', 'Convert premium · sign institutional licences · enterprise and government reskilling on UloX'],
        ['PHASE 3 · 24–36 MONTHS', 'Scale', 'Expand across Nigeria and West Africa · grow the learning economy · win large institutional contracts'],
      ];
      return phases.flatMap(([k, t, b], i) => [
        ...card(c[i].x, 184, c[i].w, 120),
        rect(c[i].x, 184, 3, 120, LADDER[i * 2], 0),
        text(c[i].x + 18, 202, c[i].w - 36, k, { size: 8.5, bold: true, color: FAINT, spacing: 1 }),
        text(c[i].x + 18, 218, c[i].w - 36, t, { size: 17, bold: true, font: HEAD, color: LADDER[i * 2] }),
        text(c[i].x + 18, 246, c[i].w - 36, b, { size: 10, color: DIM, lh: 1.45 }),
      ]);
    })(),
    rect(M, 326, W - M * 2, 122, PANEL2, 8),
    text(M + 24, 344, 420, 'THE ASK', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    text(M + 24, 362, 300, '₦50,000,000', { size: 32, bold: true, font: HEAD, color: BRAND }),
    text(M + 24, 404, 300, 'to turn a launched product into a scalable learning platform.', { size: 10.5, color: DIM, lh: 1.4 }),
    ...(() => {
      const left = M + 330;
      const rows = [
        ['40%', 'The Ulo learning hub', GOLD],
        ['30%', 'Product, gamification and the UloX agentic curriculum', BRAND],
        ['18%', 'School, university and enterprise expansion', LADDER[2]],
        ['12%', 'Learn2Earn pilot and impact measurement', LADDER[4]],
      ];
      return rows.flatMap(([p, l, col], i) => {
        const y = 350 + i * 24;
        return [
          text(left, y, 44, p, { size: 12, bold: true, color: col }),
          rect(left + 50, y + 4, 120, 7, PANEL, 3),
          rect(left + 50, y + 4, (parseInt(p, 10) / 40) * 120, 7, col, 3),
          text(left + 184, y, W - M - left - 184, l, { size: 10.5, color: DIM }),
        ];
      });
    })(),
    ...foot(10),
  ],
});

// 11 — Close
slides.push({
  notes: 'Close on the mission, and send them to the live product.',
  ops: [
    rect(0, 0, W, H, INK),
    rect(0, 0, 6, H, BRAND),
    ...LADDER.map((c, i) => rect(M + i * 30, 96, 20, 6, c, 3)),
    text(M, 132, 740, 'The future of work is not', { size: 40, bold: true, font: HEAD, lh: 1.12 }),
    text(M, 180, 740, 'consuming more content.', { size: 40, bold: true, font: HEAD, lh: 1.12 }),
    text(M, 232, 740, 'It is becoming more capable.', { size: 40, bold: true, font: HEAD, lh: 1.12, color: BRAND }),
    line(M, 306, M + 120, 306, BRAND, 2),
    text(M, 328, 520, 'We exist to equip people with know-how to maximise their potential on earth.', {
      size: 13,
      color: DIM,
      lh: 1.5,
    }),
    text(M, 372, 520, 'Building the workforce for the future.', { size: 13, bold: true, color: CHALK }),
    text(M, 428, 520, 'Try it now', { size: 9.5, bold: true, color: FAINT, spacing: 1.3 }),
    text(M, 446, 520, URL, { size: 22, bold: true, font: HEAD, color: BRAND }),
    text(W - M - 300, 428, 300, 'VerionX', { size: 15, bold: true, color: CHALK, align: 'right', spacing: 2 }),
    text(W - M - 300, 450, 300, 'ITOLS is the intellectual property of Elijah Moses.', { size: 9, color: FAINT, align: 'right' }),
  ],
});

// --- renderers --------------------------------------------------------------

const FONTS = {
  Arial: 'C:/Windows/Fonts/arial.ttf',
  'Arial-Bold': 'C:/Windows/Fonts/arialbd.ttf',
};

function renderPdf(outFile) {
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false });
  doc.registerFont('r', FONTS.Arial);
  doc.registerFont('b', FONTS['Arial-Bold']);
  const stream = fs.createWriteStream(outFile);
  doc.pipe(stream);

  for (const slide of slides) {
    doc.addPage({ size: [W, H], margin: 0 });
    for (const op of slide.ops) {
      if (op.t === 'rect') {
        if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r);
        else doc.rect(op.x, op.y, op.w, op.h);
        doc.fill(op.fill);
      } else if (op.t === 'line') {
        doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).lineWidth(op.w).stroke(op.color);
      } else if (op.t === 'text') {
        doc
          .font(op.bold ? 'b' : 'r')
          .fontSize(op.size)
          .fillColor(op.color)
          .text(op.s, op.x, op.y, {
            width: op.w,
            align: op.align,
            lineGap: (op.lh - 1) * op.size,
            characterSpacing: op.spacing,
          });
      }
    }
  }
  doc.end();
  return new Promise(resolve => stream.on('finish', resolve));
}

async function renderPptx(outFile) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'UloX16x9', width: W / 72, height: H / 72 });
  pptx.layout = 'UloX16x9';
  pptx.author = 'VerionX';
  pptx.company = 'VerionX';
  pptx.title = 'VerionX — UloX 2026';

  const hex = c => c.replace('#', '');
  const inch = v => v / 72;

  for (const slide of slides) {
    const s = pptx.addSlide();
    s.background = { color: hex(INK) };
    for (const op of slide.ops) {
      if (op.t === 'rect') {
        s.addShape(op.r ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          x: inch(op.x),
          y: inch(op.y),
          w: inch(op.w),
          h: inch(op.h),
          fill: { color: hex(op.fill) },
          line: { type: 'none' },
          ...(op.r ? { rectRadius: Math.min(0.5, inch(op.r)) } : {}),
        });
      } else if (op.t === 'line') {
        s.addShape(pptx.ShapeType.line, {
          x: inch(op.x1),
          y: inch(op.y1),
          w: inch(op.x2 - op.x1),
          h: inch(op.y2 - op.y1),
          line: { color: hex(op.color), width: op.w },
        });
      } else if (op.t === 'text') {
        // Height is generous and valign is top, so PowerPoint's own wrapping
        // never pushes a block onto the shape below it.
        const lines = Math.max(1, op.s.split('\n').length);
        s.addText(op.s, {
          x: inch(op.x),
          y: inch(op.y - op.size * 0.28),
          w: inch(op.w),
          h: inch(op.size * op.lh * (lines + 2.2)),
          fontSize: op.size,
          bold: op.bold,
          color: hex(op.color),
          align: op.align,
          fontFace: op.font,
          valign: 'top',
          margin: 0,
          charSpacing: op.spacing,
          lineSpacingMultiple: op.lh,
          wrap: true,
        });
      }
    }
    if (slide.notes) s.addNotes(slide.notes);
  }

  await pptx.writeFile({ fileName: outFile });
}

const outDir = path.resolve(process.argv[2] || '.');
fs.mkdirSync(outDir, { recursive: true });
const base = 'VerionX-UloX-Deck-2026';

await renderPdf(path.join(outDir, `${base}.pdf`));
await renderPptx(path.join(outDir, `${base}.pptx`));

for (const ext of ['pdf', 'pptx']) {
  const f = path.join(outDir, `${base}.${ext}`);
  console.log(`${base}.${ext}  ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
}
console.log(`slides: ${slides.length}`);
