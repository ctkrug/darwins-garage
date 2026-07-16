# Backlog

Epics and stories for the v1 build. Every story lists 1-3 verifiable acceptance criteria — a
later run (or QA) should be able to check each one true/false, not judge it on vibes. Story 1.1
is the wow moment and must land before anything else in this backlog.

## Epic 1 — Evolution engine & core simulation

- [ ] **1.1 [WOW] Generation slider demo end-to-end**
  - Loading the app auto-runs and caches generations 0-40 against the default track with no
    user interaction required.
  - Dragging the generation slider to any value between 0 and 40 replays that generation's best
    car within 1 second.
  - The best car's fitness (distance traveled) at generation 40 is at least 5x the best
    fitness at generation 0.

- [ ] **1.2 Physics builder: genome → Matter.js car**
  - `buildCar(genome)` returns a Matter.js `Composite` with one polygon chassis body and one
    body per genome wheel, connected by constraints.
  - The composite can be added to a `World` and stepped for 1000 ticks without throwing or
    producing `NaN` positions.
  - Each wheel has a configurable motor torque that, when applied, drives the chassis forward
    on flat ground.

- [ ] **1.3 Fitness evaluation & simulation runner**
  - `simulateGenome(genome, track, seed)` returns a fitness number equal to the maximum
    horizontal distance the chassis reached.
  - Calling `simulateGenome` twice with the same genome, track, and seed returns bit-identical
    fitness (determinism check).
  - A chassis that tilts past a configurable flip-angle threshold is marked failed and its
    fitness is capped at its distance at the moment of failure.

- [ ] **1.4 Selection, crossover, and mutation**
  - `evolvePopulation(population, fitnesses)` returns a next generation of the same size.
  - Crossover between two parents produces a child whose chassis vertex count equals one of
    the two parents' vertex counts (never an invalid count).
  - At mutation rate 0, `evolvePopulation` reproduces selected parents unchanged (a control
    test proving the mutation operator, not selection, is the source of variation).

- [ ] **1.5 Generation history & default track**
  - Running N generations stores each generation's full population and fitness array, addressable
    by generation index (`history[i]`).
  - A default hill-climb track (an array of terrain segments) ships and is used whenever no
    custom track is selected.
  - Computing 40 generations of history runs in a chunked/async pass (e.g. `requestIdleCallback`
    or batched `setTimeout`) that never blocks the main thread for more than ~50ms at a stretch.

- [ ] **1.6 Design polish: simulation viewport & HUD**
  - The simulation viewport, generation slider, and HUD readouts use the colors, type, and
    spacing tokens from `docs/DESIGN.md` — no unstyled native slider/button remains.
  - The HUD shows generation number, best fitness, and population size, and updates live as the
    slider moves.

## Epic 2 — Population viz, playback & sharing

- [ ] **2.1 Population overview renderer**
  - Selecting a generation renders every car in that generation's population as a silhouette on
    the workshop-floor canvas.
  - Tapping/clicking a car selects it and switches the view to single-car replay.
  - A "hall of fame" strip shows the best-ever car across all generations run so far, and
    updates when a new best-ever fitness appears.

- [ ] **2.2 Single-car replay & playback controls**
  - Play/pause/step controls scrub a selected car's run frame-by-frame using the deterministic
    simulation from 1.3.
  - A playback-speed control (0.5x/1x/2x/4x) changes replay speed without changing the physics
    outcome (same fitness, same end state).
  - The camera follows the car with the 120ms ease-out tween from `docs/DESIGN.md` — no hard
    camera cuts.

- [ ] **2.3 Shareable replay links**
  - A "Share" control encodes `{genome, generation, trackId}` into a compact URL parameter.
  - Opening a shared URL in a fresh session reconstructs and replays the exact same run,
    producing the same fitness result as the original.
  - An invalid or corrupted share parameter renders an inline error state instead of crashing
    the app.

- [ ] **2.4 Juice pass: sound & win celebration**
  - All five synth SFX from `docs/DESIGN.md` (tick, clatter, thud, chime, fanfare) fire on their
    respective triggers using WebAudio oscillators/noise — zero audio files.
  - The mute toggle persists across reloads via `localStorage` and silences all SFX immediately
    when engaged.
  - A new best-ever fitness triggers the confetti-and-stats-flash celebration described in
    `docs/DESIGN.md`.

- [ ] **2.5 Design polish: mobile touch & responsive layout**
  - At 390px width, the viewport, slider, and HUD compose per `docs/DESIGN.md`'s layout intent
    with no horizontal scroll or element overlap.
  - The generation slider, playback buttons, and mute toggle all have ≥44px touch targets and
    respond to tap/drag on a touch-emulated device.
  - `prefers-reduced-motion` disables the camera tween, confetti, and impact shake while keeping
    the slider and playback fully functional.

## Epic 3 — Track editor & custom tracks

- [ ] **3.1 Track editor: draw and drag terrain control points**
  - The editor lets a user add, drag, and delete terrain control points on a canvas, updating an
    underlying track data array in real time.
  - Invalid edits (duplicate x-coordinates, fewer than 2 points) show an inline error message
    rather than crashing or silently corrupting the track.
  - A "run evolution on this track" action starts a fresh evolution run against the edited track
    and switches to the simulation view.

- [ ] **3.2 Track persistence & switching**
  - Edited tracks save to `localStorage` keyed by name and reload from a track picker control.
  - Switching to a different track prompts for confirmation before discarding in-progress
    generation history (fitness isn't comparable across tracks, so history resets on switch).
  - The built-in default track cannot be overwritten — saving under its name creates a copy
    instead.

- [ ] **3.3 Design polish: track editor visuals**
  - The track editor canvas and its controls use the tokens from `docs/DESIGN.md`; control
    points and drag handles have themed hover/active states, not native browser defaults.
  - An empty editor state (no custom tracks saved yet) shows designed copy and an illustration
    cue, not a blank canvas.

---

**Total: 14 stories across 3 epics.**
