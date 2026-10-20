# UloX by VerionX

**Mastering the utility of AI.**

UloX is an installable web app that teaches agentic engineering the way a chess
trainer teaches chess: you read a short idea, you are handed a *broken* system
and asked to fix it, then you build the thing yourself. Six disciplines, in the
order that makes them make sense.

| # | Discipline | What you can do after it |
|---|------------|--------------------------|
| 1 | Prompt engineering  | Get a model to do exactly what you asked, the same way every time |
| 2 | Context engineering | Give a model exactly the information it needs, and nothing that misleads it |
| 3 | Harness engineering | Wire a model to real tools, with contracts that hold and failures that surface |
| 4 | Loop engineering    | Let a system act repeatedly — and know exactly when to stop |
| 5 | Graph engineering   | Branch, merge and guard many steps so control flow stays deterministic |
| 6 | Agentic engineering | Put it together: bounded, observable systems that fail safe under attack |

Live: <https://ulox-by-verionx-2wh3u8.v2.appdeploy.ai/>

---

## How the learning engine works

The teaching model is reverse-engineered from chess training rather than from
courseware.

- **Tactics, not quizzes.** Each drill is a small agent graph that is *already
  broken* — an unbounded loop, a router with two matching branches, a guard that
  logs but never blocks. You repair it with a bounded number of moves.
- **A real search engine scores you.** `src/lib/engine.ts` runs a beam search
  over the move space toward a stated success criterion, the way an engine
  searches toward mate. It produces the hint, the "best move" line, and the
  Agentic Advantage Score (−9.9…+9.9) for any position.
- **A deterministic simulator decides truth.** `src/lib/simulate.ts` executes a
  graph against sequential mock injections, so "did your fix work" is a fact,
  not an opinion.
- **Glicko-2 ratings** (`src/lib/glicko.ts`) move with your results, in single
  player and in rated matches.

Every drill is proved healthy before it ships: `scripts/verify.ts` brute-forces
all 18 tactics and asserts each is solvable within the move limit, is *not*
already solved at the start, and is findable by the hint the app actually gives.

## The ITOLS contract

Agent behaviour in the Lab is written as an explicit contract — **I**dentity,
**T**asks, **O**utcome, **L**anguage, **S**ecurity — so that "the prompt" stops
being prose and becomes five fields you can diff, test and grade.

## Certificates

Finish a discipline (read every topic, fix every drill, complete the build) and
UloX issues a certificate with a publicly verifiable code at `/#/verify/:code`.
Finish all six and the Agentic Engineering capstone unlocks.

Requirements are re-derived on the server (`backend/certificates.ts`) from the
player's stored progress before anything is issued — the client cannot assert
that it earned one. The honest limit is documented at the top of that file:
progress is *reported* by the client, so these are a record of work done on the
platform, not a tamper-proof credential, and the UI says so.

## Content, pulled live

Nothing here is a hardcoded copy of someone else's site. The backend fetches,
parses and caches from source, with fork-first / upstream-fallback candidates so
a single repository outage cannot take a library down:

- **roadmap.sh** — 94 roadmaps with real node geometry, so the paths render with
  their connecting edges and each node opens its own topic content and videos.
- **ai-engineering-from-scratch** — a 250-term glossary and 154 cheatsheets,
  indexed and searchable (alias-aware: "RAG" finds "Retrieval-Augmented
  Generation").
- **freeCodeCamp**, **free-programming-books**, **awesome**, **public-apis**,
  **build-your-own-x** — surfaced as working tools inside the Toolkit, not links.

## Multiplayer

Rated matches over the platform's realtime channels: a shared, deterministic
five-tactic deal, live presence with an opt-in map of who is online, room codes,
challenges and chat.

---

## Running it

```bash
npm install
npm run dev
```

`@appdeploy/client` and `@appdeploy/sdk` are injected by the hosting platform at
build time and are deliberately **not** dependencies in `package.json`. The app
builds and deploys against AppDeploy; `npm run dev` gives you the UI, but API,
auth, database and realtime calls need the platform.

### Checks

```bash
npx tsc --noEmit        # strict, no implicit any
npx tsx scripts/audit.ts   # cross-file consistency
npx tsx scripts/verify.ts  # proves every drill is solvable and hintable
```

`scripts/audit.ts` is the guard rail that makes a large single-developer
codebase safe to change. It checks every `api.*` call against a declared backend
route *in both directions*, every `<Link>` against the router, realtime entity
names on both sides, drill ↔ topic ↔ preset references, journey placement, field
notes against the cheatsheet index, certificate tracks against the journey
stages, and the platform's import rules.

## Layout

```
src/lib/journey.ts      the spine: six stages, and the single next step
src/lib/engine.ts       beam search, scoring, hints
src/lib/simulate.ts     deterministic graph execution
src/lib/puzzles.ts      the 18 tactics
backend/index.ts        routes
backend/certificates.ts server-side certificate verification
backend/roadmaps.ts     roadmap.sh ingestion and edge geometry
backend/resources.ts    the eight libraries, cached in chunks
scripts/audit.ts        cross-file consistency checks
scripts/verify.ts       drill solvability proof
```
