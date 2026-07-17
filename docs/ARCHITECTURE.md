# Architecture

A map of the codebase for anyone (or any later phase) picking this up cold.

## The shape of it

Everything runs client-side. There is no server, no build-time data, no
persistence beyond `localStorage`. The whole app is a static bundle.

The central design constraint is **determinism**: a genome plus a track plus a
seed must always produce the same run, because that is the only reason a share
link can work without a database. Every module below is built around that.

Data flows one way:

```
rng ──► genome ──► evolution ──► history ──► main (DOM, loop)
                      │             │           │
                      └──► car ──► simulate ────┤
                                   track ───────┤
                                   render ◄─────┤
                                   audio  ◄─────┤
                                   share  ◄─────┘
```

Nothing below `main.js` touches the DOM. Nothing above `car.js` touches Matter.js.

## Modules

| File | Responsibility |
|---|---|
| `src/rng.js` | Seedable mulberry32 PRNG. **Nothing in the evolution or physics path may call `Math.random`** — it would break replay. |
| `src/genome.js` | The genome: a polygon chassis (5–8 vertices) + 2–4 wheels (vertex index, radius, torque). Plain JSON data. `normalizeGenome` is the gatekeeper — it clamps every field into `GENOME_LIMITS` and **quantizes to the share encoder's grid** (whole pixels, 3-decimal torque). |
| `src/track.js` | Terrain as an ordered control-point list, plus the built-in hill-climb course. `validateTrack` returns readable problems rather than throwing, because the editor shows them inline. |
| `src/car.js` | The only place genomes become Matter bodies. Hulls the chassis, pins wheels with zero-length rigid constraints (a pin joint = a driven axle). Also exposes `chassisOutline`/`wheelAnchors` so the renderer can draw a car without building physics for it. |
| `src/simulate.js` | Runs one genome against one track. `createSimulation` is a **resumable stepper**; `simulateGenome` runs it to completion. Fitness = max horizontal distance reached. |
| `src/evolution.js` | Tournament selection, crossover, mutation. Pure data transforms; no physics. |
| `src/history.js` | The run loop. Keeps **every** generation (the slider replays history, so history is the product). `runAllAsync` slices work across physics ticks to keep the page responsive. |
| `src/render.js` | Canvas drawing + camera. Reads state, paints it, advances nothing. |
| `src/confetti.js` | Pure particle model (spawn/step) for the best-ever celebration burst. Decorative UI, so `Math.random` is fine here — it never touches the physics/RNG path. |
| `src/audio.js` | WebAudio SFX synthesized in code. Zero audio files. |
| `src/share.js` | Encodes `{genome, generation, trackId}` into a URL param. `decodeShare` returns a result object and never throws. |
| `src/main.js` | The seam: owns the DOM, the rAF loop, and the run. |
| `src/style.css` | The scrapyard-workshop tokens from `docs/DESIGN.md`. |

## Decisions worth knowing before you change something

**Genomes are quantized, and that is load-bearing.** Physics is chaotic, so
rounding a genome's coordinates when building a share link made the shared car
replay a *different run* than the one it scored. Rather than put full float
precision in the URL, genomes are canonical at whole pixels / 3-decimal torque,
so encoding is lossless by construction. The grid is far finer than the mutation
jitter, so the search is unaffected. **Do not un-quantize `normalizeGenome`.**

**The simulation is a stepper because one car can cost 250ms.** Matter's
per-tick cost scales with contacts, so chunking per *individual* still blew a
~100ms hole in the main thread. `runGenerationAsync` therefore checks a 20ms
budget before each car's setup and every 2 physics ticks. It yields via
`MessageChannel`, not `setTimeout`, whose ~4ms clamp would add seconds across
hundreds of yields.

**Elites carry over untouched.** Without them a lucky champion can be lost to a
bad mutation and best-fitness regresses — which reads as *broken* to someone
scrubbing the slider. `test/history.test.js` asserts the curve never regresses.

**Mutation and crossover have separate dials.** Recombination introduces genomes
absent from the parent pool independently of mutation, so isolating either one
in a test needs both `mutationRate` and `crossoverRate`.

**Wheel torque can be zero.** An undriven, free-rolling wheel is a legitimate
design that evolution should be able to find. It also means "motor off" is a
real control condition in tests.

**The default track is tuned, not drawn by eye.** Earlier shapes were solved by
generation 4, leaving the slider nothing to show. Rubble amplitude and climb
height hold generation 0 to ~8% of the course while leaving a gradient to climb.
If you change the track, re-run `test/acceptance.test.js` — it guards the wow
moment.

## Known limitation: cross-engine determinism

Within one JS engine, runs are bit-identical — every replay and share test
depends on it. **Across engines they can diverge microscopically**: ECMAScript
does not bit-specify `Math.cos`/`sin`/`atan2`, and Matter (and genome
construction) use them. Measured between Node 20 and Chromium, fitnesses agree
to ~1e-6 px for most individuals, but chaos occasionally amplifies that into a
visible difference (one individual in 24 differed by 0.2px over a full run).

In practice a share link opened in a *browser* replays correctly, and the app is
consistent for any one user. It is not a bit-exact guarantee across every
engine, and closing that would mean replacing every transcendental in the
physics path — not worth it. Do not claim exactness beyond this.

## Running it

```bash
npm install
npm run dev      # vite dev server
npm test         # node --test; pure logic + physics, no browser needed
npm run lint     # eslint (browser globals for src/, node globals for test/)
npm run build    # -> dist/, static and base-path-relative
npm run preview  # serve the built dist/
```

`vite.config.js` sets `base: './'` and `index.html` carries `<base href="./">`
because the app is served from a **subpath**
(`apps.charliekrug.com/darwins-garage/`). Any leading-slash asset path would
404 there.

## Tests

`test/acceptance.test.js` is the important one: it runs the real 40-generation
demo and asserts story 1.1's promise (gen 0 finishes nobody; gen 40 completes
the course at ≥5× the fitness; the gain is gradual; scrubbing replays the exact
recorded fitness). It is slow by design — it is the only test that exercises the
whole engine end to end. The rest are fast unit tests per module.
