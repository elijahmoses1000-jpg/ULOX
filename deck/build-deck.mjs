// VerionX / UloX investor deck — one model, two renderers.
//
// Every slide is a flat list of four primitives: rect, text, line and image.
// The PDF renderer and the PPTX renderer each implement only those four, so
// the two files cannot drift from each other.
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

// Assets sit next to the output, so the script can run from wherever the
// node_modules happen to live.
const ASSETS = path.resolve(process.argv[2] || '.', 'assets');
const photo = name => path.join(ASSETS, name);

// --- primitives -------------------------------------------------------------

const rect = (x, y, w, h, fill, r = 0, alpha = 1) => ({ t: 'rect', x, y, w, h, fill, r, alpha });
const line = (x1, y1, x2, y2, color, w = 1) => ({ t: 'line', x1, y1, x2, y2, color, w });
const image = (file, x, y, w, h) => ({ t: 'image', file, x, y, w, h });
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

function head(kicker, title, opts = {}) {
  const ops = [];
  if (kicker) {
    ops.push(text(M, 46, W - M * 2, kicker.toUpperCase(), { size: 10.5, bold: true, color: BRAND, spacing: 1.6 }));
  }
  ops.push(text(M, 68, opts.titleW ?? W - M * 2, title, { size: opts.size ?? 30, bold: true, font: HEAD, lh: 1.14 }));
  return ops;
}

function foot(n) {
  return [
    line(M, H - 44, W - M, H - 44, LINE, 1),
    text(M, H - 36, 400, 'VerionX  ·  UloX', { size: 9, color: FAINT, spacing: 0.6 }),
    text(W - M - 300, H - 36, 300, `${URL}   ${String(n).padStart(2, '0')}`, { size: 9, color: FAINT, align: 'right' }),
  ];
}

function cols(count, gap = 18, left = M, right = W - M) {
  const total = right - left;
  const w = (total - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: left + i * (w + gap), w }));
}

function stat(x, y, w, value, label, color = CHALK, size = 34) {
  return [
    text(x, y, w, value, { size, bold: true, font: HEAD, color }),
    text(x, y + size + 6, w, label, { size: 10, color: DIM, lh: 1.3 }),
  ];
}

function card(x, y, w, h, fill = PANEL) {
  return [rect(x, y, w, h, fill, 8), rect(x, y, 3, h, LINE, 0)];
}

/** A photo with a caption bar, used wherever a slide needs a real room in it. */
function plate(file, x, y, w, h, caption) {
  const ops = [image(file, x, y, w, h)];
  if (caption) {
    ops.push(rect(x, y + h - 26, w, 26, INK, 0, 0.72));
    ops.push(text(x + 10, y + h - 19, w - 20, caption, { size: 8.5, color: '#CFD3D8' }));
  }
  return ops;
}

// --- slides -----------------------------------------------------------------

const slides = [];

// 1 — Cover
slides.push({
  notes:
    'Open on the room. VerionX already has 80,000 students in Nigerian classrooms through Ulo. UloX is the next rung: agentic engineering, free, live in the browser.',
  ops: [
    rect(0, 0, W, H, INK),
    image(photo('ikoyi-classroom.jpg'), W / 2 - 10, 0, W / 2 + 10, H),
    // A scrim so the type holds against the photograph.
    rect(W / 2 - 10, 0, 170, H, INK, 0, 0.92),
    rect(W / 2 + 160, 0, W / 2 - 150, H, INK, 0, 0.28),
    rect(0, 0, 6, H, BRAND),
    text(M, 112, 460, 'VerionX', { size: 15, bold: true, color: BRAND, spacing: 2.4 }),
    text(M, 150, 470, 'Building the workforce', { size: 37, bold: true, font: HEAD, lh: 1.08 }),
    text(M, 192, 470, 'for the future.', { size: 37, bold: true, font: HEAD, lh: 1.08, color: BRAND }),
    text(M, 266, 392, 'We exist to equip people with know-how to maximise their potential on earth.', {
      size: 13.5,
      color: DIM,
      lh: 1.5,
    }),
    line(M, 320, M + 110, 320, BRAND, 2),
    text(M, 342, 430, 'UloX — mastering the utility of AI', { size: 16, bold: true, font: HEAD }),
    text(M, 366, 430, 'The agentic engineering trainer. Free, and live in the browser.', { size: 11.5, color: DIM }),
    text(M, 418, 430, URL, { size: 13, bold: true, color: BRAND }),
    text(W - 230, H - 34, 190, 'Government College, Ikoyi', { size: 8.5, color: '#CFD3D8', align: 'right' }),
  ],
});

// 2 — Where the gap moved
slides.push({
  notes:
    'The point: access to AI is cheap now. Reliability is what teams cannot buy, and it is what nobody is teaching.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('01 — Where the gap moved', 'Anyone can call a model.\nThe failures start after that.'),
    ...(() => {
      const c = cols(3);
      const out = [];
      const items = [
        ['Calling a model is easy', 'Three lines of code and an API key. Teams hit trouble after the first response, not before it.', BRAND],
        ['Agents fail in production', 'They stall, loop without stopping, leak data through tool output and burn budget. Teams find out when a customer does.', GOLD],
        ['Training stops at the prompt', 'Courses teach you how to word a request. They skip context, harness, loop, graph and safety.', LADDER[2]],
      ];
      items.forEach(([t, b, col], i) => {
        out.push(...card(c[i].x, 196, c[i].w, 132));
        out.push(rect(c[i].x, 196, 3, 132, col, 0));
        out.push(text(c[i].x + 20, 216, c[i].w - 40, t, { size: 15, bold: true, font: HEAD, color: col }));
        out.push(text(c[i].x + 20, 244, c[i].w - 40, b, { size: 11, color: DIM, lh: 1.45 }));
      });
      return out;
    })(),
    rect(M, 350, W - M * 2, 96, PANEL2, 8),
    text(M + 24, 368, 400, 'WHAT A WORKING AGENT ACTUALLY NEEDS', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    ...(() => {
      const c = cols(3, 18, M + 24, W - M - 24);
      return [
        ...stat(c[0].x, 390, c[0].w, '6', 'disciplines, from prompt through to agentic', CHALK, 26),
        ...stat(c[1].x, 390, c[1].w, '1', 'of the six that most courses reach', BRAND, 26),
        ...stat(c[2].x, 390, c[2].w, '18', 'failure modes UloX drills by hand', LADDER[0], 26),
      ];
    })(),
    ...foot(2),
  ],
});

// 3 — Mission and vision
slides.push({
  notes: 'Mission and vision verbatim. Ulo and UloX are two stages of the same answer.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('02 — Why VerionX exists', 'Ulo and UloX answer the same\nmission at two different stages.'),
    rect(M, 186, 420, 136, PANEL, 8),
    rect(M, 186, 3, 136, BRAND, 0),
    text(M + 22, 204, 380, 'MISSION', { size: 9.5, bold: true, color: BRAND, spacing: 1.4 }),
    text(M + 22, 226, 376, 'We exist to equip people with know-how to maximise their potential on earth.', {
      size: 14,
      bold: true,
      font: HEAD,
      lh: 1.35,
    }),
    rect(M, 334, 420, 112, PANEL, 8),
    rect(M, 334, 3, 112, LADDER[3], 0),
    text(M + 22, 352, 380, 'VISION', { size: 9.5, bold: true, color: LADDER[3], spacing: 1.4 }),
    text(M + 22, 374, 376, 'Building the workforce for the future.', { size: 14, bold: true, font: HEAD, lh: 1.35 }),
    ...plate(photo('ikeja-student.jpg'), M + 444, 186, 404, 150, 'Ikeja High School'),
    text(M + 444, 352, 404, 'WHERE EACH ONE FITS', { size: 9.5, bold: true, color: FAINT, spacing: 1.3 }),
    text(M + 444, 374, 404, 'Ulo: gamified learning for school-age Nigeria. Learn, play, practise, prove, earn.', {
      size: 11,
      color: DIM,
      lh: 1.45,
    }),
    text(M + 444, 412, 404, 'UloX: agentic engineering for the people who will build and run the systems.', {
      size: 11,
      color: DIM,
      lh: 1.45,
    }),
    ...foot(3),
  ],
});

// 4 — The ladder
slides.push({
  notes: 'One continuous ladder. ITOLS is the grammar a learner carries up it.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('03 — How the two connect', 'One ladder, from a first lesson\nto a shipped system.'),
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
    text(M + 24, 356, 520, 'THE FRAMEWORK UNDERNEATH BOTH', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    text(M + 24, 378, 420, 'ITOLS', { size: 26, bold: true, font: HEAD, color: BRAND }),
    text(M + 24, 412, 440, 'A proprietary VerionX framework for writing an AI instruction you can test.', {
      size: 11,
      color: DIM,
      lh: 1.4,
    }),
    text(W - M - 380, 378, 356, 'Ulo teaches a student how to learn. UloX teaches an engineer how to build. Both run on ITOLS, so someone climbing from one to the other keeps the same way of instructing a model.', {
      size: 11,
      color: DIM,
      lh: 1.5,
      align: 'right',
    }),
    ...foot(4),
  ],
});

// 5 — UloX
slides.push({
  notes: 'Borrowed from chess: you study positions, not essays. The engine scores the repair.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('04 — UloX', 'UloX hands you a broken agent\nand asks you to repair it.'),
    text(M, 158, 620, 'The method comes from chess training, where players work through positions instead of reading essays about chess.', {
      size: 12.5,
      color: DIM,
      lh: 1.5,
    }),
    ...(() => {
      const out = [];
      const items = [
        ['Every drill starts broken', 'An unbounded loop. A router with two branches that both match. A guard that logs an attack and lets it through anyway.'],
        ['A search engine scores your fix', 'A beam search solves the position first, so the hint you get is the opening move of a line that actually works.'],
        ['The simulator runs it', 'Each repair executes against mock tool responses. You watch it hold, or watch it fall over.'],
        ['Rated on what you solved', 'Glicko-2 ratings move with your results, in single player and in rated matches against other engineers.'],
      ];
      const c = cols(2, 20);
      items.forEach(([t, b], i) => {
        const x = c[i % 2].x;
        const y = 204 + Math.floor(i / 2) * 118;
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

// 6 — ITOLS
slides.push({
  notes:
    'ITOLS is the IP, created by Elijah Moses and proprietary to VerionX. Five layers, three sub-layers each. Fifteen fields a reviewer can check.',
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
        out.push(rect(M + 18, y + 12, 32, 32, col, 6));
        out.push(text(M + 18, y + 19, 32, letter, { size: 16, bold: true, font: HEAD, color: INK, align: 'center' }));
        out.push(text(M + 62, y + 13, 150, name, { size: 15, bold: true, font: HEAD, color: col }));
        out.push(text(M + 62, y + 34, 180, meaning, { size: 10, color: DIM }));
        const cx = M + 262;
        const cw = (W - M - 20 - cx) / 3;
        subs.forEach((s, j) => {
          out.push(rect(cx + j * cw, y + 14, cw - 12, 28, PANEL2, 5));
          out.push(text(cx + j * cw, y + 22, cw - 12, s, { size: 11, bold: true, align: 'center' }));
        });
      });
      return out;
    })(),
    text(M, 462, W - M * 2, 'Fifteen fields a reviewer can check, in place of a paragraph of prose. UloX teaches, drills and scores all five layers.', {
      size: 10.5,
      color: DIM,
      lh: 1.4,
    }),
    ...foot(6),
  ],
});

// 7 — How it teaches
slides.push({
  notes: 'The four steps, and the three things that took real work to build.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('06 — The loop', 'Each discipline runs\nthe same four steps.'),
    ...(() => {
      const out = [];
      const steps = [
        ['READ', 'A short idea, written at the level you picked.'],
        ['FIX', 'A broken system, repaired inside a move limit.'],
        ['BUILD', 'The same pattern from nothing, graded by the simulator.'],
        ['PROVE', 'A certificate carrying a code anyone can check.'],
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
    text(M + 24, 332, 520, 'THREE THINGS THAT TOOK TIME TO BUILD', { size: 9.5, bold: true, color: FAINT, spacing: 1.2 }),
    ...(() => {
      const c = cols(3, 20, M + 24, W - M - 24);
      const items = [
        ['Drills we verified', 'A script brute-forces all 18 before release. Each one must be solvable inside its move limit, must not already be solved, and must be reachable by the hint the app gives.'],
        ['Certificates you earn', 'The server re-derives every requirement before it issues one. A learner cannot tick the build step for themselves.'],
        ['A loop back in', 'Publish a build and anyone can open the link, replay the run and fork it into their own Lab.'],
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
    'Ulo numbers come from the 2026 deck. UloX numbers are what is live and countable in the product today.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('07 — Proof', 'We are past the idea stage.'),
    ...plate(photo('owerri-assembly.jpg'), M, 126, 196, 118, 'Owerri City High School'),
    ...plate(photo('calabar-lineup.jpg'), M + 206, 126, 196, 118, 'Holy Child, Calabar'),
    ...plate(photo('activation-assembly.jpg'), M + 412, 126, 196, 118, 'Secondary school activation'),
    ...plate(photo('community-outreach.jpg'), M + 618, 126, 230, 118, 'Community drive, Lagos'),
    text(M, 262, 560, 'ULO — WHAT THE OUTREACH HAS REACHED', { size: 9.5, bold: true, color: GOLD, spacing: 1.3 }),
    ...(() => {
      const c = cols(5, 14);
      const items = [
        ['80,000', 'students engaged in 10 months'],
        ['40', 'secondary schools activated'],
        ['7', 'universities engaged'],
        ['1.2M+', 'teachers via Nigeria Teachers'],
        ['100+', 'student ambassadors'],
      ];
      return items.flatMap(([v, l], i) => stat(c[i].x, 284, c[i].w, v, l, GOLD, 24));
    })(),
    line(M, 356, W - M, 356, LINE, 1),
    text(M, 368, 560, 'ULOX — WHAT IS LIVE TODAY', { size: 9.5, bold: true, color: BRAND, spacing: 1.3 }),
    ...(() => {
      const c = cols(5, 14);
      const items = [
        ['18', 'drills, each proved solvable'],
        ['6', 'disciplines with guided builds'],
        ['94', 'roadmaps pulled live'],
        ['250', 'glossary terms, alias-aware'],
        ['154', 'one-page field notes'],
      ];
      return items.flatMap(([v, l], i) => stat(c[i].x, 390, c[i].w, v, l, BRAND, 24));
    })(),
    text(M, 462, W - M * 2, 'Federal Government: co-partner on the national refugee re-skilling programme. Nigeria Teachers (1.2M+ members). UNILAG, FUTO, UNICAL, LASU, UNIBEN and Bauchi State University. Ten AI labs being set up in schools.', {
      size: 9.5,
      color: DIM,
      lh: 1.4,
    }),
    ...foot(8),
  ],
});

// 9 — Market and timing
slides.push({
  notes: 'Two markets stacked: the EdTech base Ulo already sells into, and the AI-skills gap UloX is built for.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('08 — Market and timing', '65 million students, and almost no\ntraining in how AI systems fail.'),
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
    text(M + 24, 368, (W - M * 2) / 2 - 40, 'Boards are telling their teams to add AI. Few of those teams have anyone who can make an agent behave under failure, attack or cost pressure.', {
      size: 11.5,
      color: DIM,
      lh: 1.5,
    }),
    text(W / 2 + 12, 368, (W - M * 2) / 2 - 40, 'UloX runs free in a browser and is live today. The route to market is the one Ulo has already walked: Nigeria, then West Africa, then the wider continent.', {
      size: 11.5,
      color: DIM,
      lh: 1.5,
    }),
    ...foot(9),
  ],
});

// 10 — Roadmap and the ask
slides.push({
  notes: 'The ask is unchanged in size; this shows where UloX sits inside it.',
  ops: [
    rect(0, 0, W, H, INK),
    ...head('09 — Roadmap and the ask', 'From a launched product\nto a scalable platform.'),
    ...(() => {
      const c = cols(3, 18);
      const phases = [
        ['PHASE 1 · 0–12 MONTHS', 'Optimise', 'Open the first learning hub. Deepen the gamification engine. Ship the agentic curriculum. Prove engagement.'],
        ['PHASE 2 · 12–24 MONTHS', 'Monetise', 'Convert premium subscribers. Sign institutional licences. Run enterprise and government reskilling on UloX.'],
        ['PHASE 3 · 24–36 MONTHS', 'Scale', 'Expand across Nigeria and West Africa. Grow the learning economy. Win large institutional contracts.'],
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
        ['30%', 'Product, gamification and the UloX curriculum', BRAND],
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
  notes: 'Close on the room, and send them to the live product.',
  ops: [
    rect(0, 0, W, H, INK),
    image(photo('ikoyi-engaged.jpg'), 0, 0, W, H),
    rect(0, 0, W, H, INK, 0, 0.74),
    rect(0, 0, 6, H, BRAND),
    ...LADDER.map((c, i) => rect(M + i * 30, 96, 20, 6, c, 3)),
    text(M, 132, 740, 'The future of learning is not', { size: 38, bold: true, font: HEAD, lh: 1.12 }),
    text(M, 178, 740, 'consuming more content.', { size: 38, bold: true, font: HEAD, lh: 1.12 }),
    text(M, 228, 740, "It's becoming more capable.", { size: 38, bold: true, font: HEAD, lh: 1.12, color: BRAND }),
    line(M, 300, M + 110, 300, BRAND, 2),
    text(M, 322, 520, 'We exist to equip people with know-how to maximise their potential on earth.', {
      size: 13,
      color: '#CFD3D8',
      lh: 1.5,
    }),
    text(M, 366, 520, 'Building the workforce for the future.', { size: 13, bold: true, color: CHALK }),
    text(M, 424, 520, 'Try it now', { size: 9.5, bold: true, color: '#B9BEC4', spacing: 1.3 }),
    text(M, 442, 520, URL, { size: 22, bold: true, font: HEAD, color: BRAND }),
    text(W - M - 300, 424, 300, 'VerionX', { size: 15, bold: true, color: CHALK, align: 'right', spacing: 2 }),
    text(W - M - 300, 446, 300, 'ITOLS is the intellectual property of Elijah Moses.', { size: 9, color: '#B9BEC4', align: 'right' }),
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
        if (op.alpha !== 1) doc.fillOpacity(op.alpha);
        if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r);
        else doc.rect(op.x, op.y, op.w, op.h);
        doc.fill(op.fill);
        if (op.alpha !== 1) doc.fillOpacity(1);
      } else if (op.t === 'line') {
        doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).lineWidth(op.w).stroke(op.color);
      } else if (op.t === 'image') {
        // cover scales to fill, so clip to the box or it bleeds over the slide.
        doc.save();
        doc.rect(op.x, op.y, op.w, op.h).clip();
        doc.image(op.file, op.x, op.y, { cover: [op.w, op.h], align: 'center', valign: 'center' });
        doc.restore();
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
          fill: { color: hex(op.fill), ...(op.alpha !== 1 ? { transparency: Math.round((1 - op.alpha) * 100) } : {}) },
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
      } else if (op.t === 'image') {
        s.addImage({
          path: op.file,
          x: inch(op.x),
          y: inch(op.y),
          w: inch(op.w),
          h: inch(op.h),
          sizing: { type: 'cover', w: inch(op.w), h: inch(op.h) },
        });
      } else if (op.t === 'text') {
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
