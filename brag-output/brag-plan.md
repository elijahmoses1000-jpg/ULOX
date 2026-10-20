# UloX — 21 launch videos

Twenty-one square (1080×1080) MP4s built with `/brag-slim`'s creative rules:
every frame is a pure function of time, every product shot is a real screenshot
of the deployed app rather than a mockup, and no invented claims, numbers or
testimonials appear anywhere. Each ships with a matching `.jpg` poster.

All of them close on **www.ulox.verionx.org**.

> **Before publishing:** that domain has to be pointed at the app. Until the
> custom domain is attached in AppDeploy and DNS resolves, the URL on screen
> will not open anything. The live address today is
> `ulox-by-verionx-2wh3u8.v2.appdeploy.ai`.

## The angle

UloX is not "another AI course". The one-sentence claim is: **you learn agentic
engineering by repairing broken agent systems, the way a chess player learns
tactics.** Every video leads with something a stranger can act on after one
viewing, and none of them lead with how the app is built.

## The set

Each video answers a different question, so the whole set can be posted over
weeks without repeating a beat.

### Core six — what it is

| # | File | Question it answers |
|---|------|--------------------|
| 1 | `01-what-is-ulox` | What is this? |
| 2 | `02-fix-the-break` | What do I actually *do* in it? |
| 3 | `03-six-disciplines` | Why is it structured this way? |
| 4 | `04-play-someone` | There's *multiplayer*? |
| 5 | `05-certificates` | What do I walk away with? |
| 6 | `06-the-library` | What else is in there? |

### Mechanisms — how it works

| # | File | The one idea |
|---|------|-------------|
| 7 | `07-itols` | A prompt you cannot test is not engineering |
| 8 | `08-the-eval-bar` | Your fix gets a number, not an opinion |
| 9 | `09-install-it` | It installs, and it works offline |
| 10 | `10-jargon-desk` | Never leave the page to look up a word |
| 11 | `11-roadmaps` | A map you can click into |
| 12 | `12-three-levels` | It changes the wording, not just the colour |
| 13 | `13-the-lab` | Build one from nothing |
| 14 | `14-puzzle-rush` | Recognition is the skill |
| 15 | `15-the-hint` | The hint is searched, not written |
| 16 | `16-rating-and-streak` | A number that means something |

### Depth — what is underneath

| # | File | The one idea |
|---|------|-------------|
| 17 | `17-make-it-safe` | Guard theatre is the common vulnerability |
| 18 | `18-field-notes` | The reference turns up when you need it |
| 19 | `19-open-libraries` | A 400,000-word README is not a tool |
| 20 | `20-one-next-step` | People quit from forty tabs, not difficulty |
| 21 | `21-who-its-for` | Everyone can call a model; nobody can make one reliable |

## Timing

All cuts land on the bar grid of the chosen track (114.84 BPM → one bar every
2.105s, first downbeat at 1.60s), taken from the `.music-cues.md` sheets that
ship with `/brag`. Scenes run 0.75–3 bars; videos run 15–21s, inside the
skill's 15–25s rule.

Readability: every line the viewer is meant to read is fully on screen and
settled for at least ~0.3s per word before the cut. Text is never pulled away
early — the pace comes from the cuts.

## Transitions

Scenes dip through the background rather than crossfading. A plain crossfade
between two busy layouts reads as a muddy double exposure; dipping keeps each
composition clean, which also means **every frame is postable** — the rule that
matters most for a square social video.

An earlier cut carried white accent flashes on the beat. They were removed:
they washed whole frames grey and, judged against "nothing on screen that has
not earned its place", they were decoration.

## Sound

Music is the bundled *Happy Beats / Business Moves* set by
[ende.app](https://ende.app/en) that ships with `/brag`, rotated across five
volumes so videos next to each other in a feed do not sound identical. Each is
trimmed to length with a 0.9s fade in and a 1.4s fade out, and sits at 72% so
it supports the cut rather than fighting it.

No sound effects: with no diegetic action on screen they would be decoration.

## Posters

Each video ships a `.jpg` poster pulled from its strongest *settled* frame, and
that poster is also embedded in the MP4 as an attached cover image.

This is a deliberate departure from the skill's "bake it in as frame 0"
instruction: replacing frame 0 with a mid-video composition puts a one-frame
jump cut at the top of every clip. The cover stream achieves the same thumbnail
result without damaging the opening, and the standalone `.jpg` covers any
platform that ignores the cover stream.

## Two bugs the stills pass caught

Worth recording, because both would have shipped silently.

1. **Crops started inside the content.** The app shell's sidebar is ~224 CSS px,
   not the ~330 assumed, so crops meant to clear it were clipping the first few
   characters of every card title.
2. **Shots rendered as empty panels.** `__draw` rebuilds the DOM every frame, so
   each scene's `<img>` is a brand new element; the first time a shot appeared,
   the screenshot could be taken before the image had decoded. Fixed by
   decoding every shot once into a detached cache at startup *and* awaiting
   `img.decode()` before every single screenshot.

## Rebuilding

```bash
node capture.mjs  <out>/work/shots              # real screenshots of the live app
node capture2.mjs <out>/work/shots              # the second set of screens
node render.mjs   <out> --stills --shard=0/3    # one still per scene, for review
node sheet.mjs    <out>                         # contact sheet per video
node render.mjs   <out> --force --shard=0/3     # full capture + encode
```

Run the sharded commands as three concurrent processes (`--shard=0/3`,
`1/3`, `2/3`). Parallelism is across *processes*, not tabs: several tabs
screenshotting inside one browser reliably kills Chromium on this machine, so
each shard gets its own browser and a disjoint slice of the list. A run that
dies can simply be repeated — videos already encoded are skipped unless
`--force` is passed.

Frames are captured at 30fps as quality-96 JPEGs (PNG screenshots were the
single biggest cost and the frames are thrown away into a lossy codec anyway)
and encoded with libx264 (CRF 18, yuv420p) plus AAC at 192k, `+faststart` for
web playback.
