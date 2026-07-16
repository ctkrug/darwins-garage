# Darwin's Garage

Watch a population of randomly-shaped vehicles evolve — real genetic algorithm, real 2D
physics — into fast, weird, working cars over generations. Then grab your favorite mutant's
replay and send it to a friend.

## What it is

Every car starts life as a random skeleton: a polygon chassis with wheels bolted on at random
points, random sizes, random torque. Generation 0 is a pile of junk — vehicles that flop, flip,
and go nowhere on a bumpy test track. Darwin's Garage runs a real genetic algorithm (tournament
selection, crossover between two parent chassis, mutation of wheel position/size/torque and
chassis geometry) on that population, generation after generation, inside a live Matter.js
physics simulation. Scrub the generation slider forward and you watch evolution actually work:
on the shipped course, the best car covers 58m in generation 0 and the full 720m by generation
20 — a shape nobody designed, climbing a hill it has never seen, then nosing over at the one
terrain feature it never evolved to handle.

## Why it's interesting

Physics-based car evolution has been built before. What's hard — and what this project is
actually about — is the *tuning*: a fitness function, mutation rate, and selection pressure that
make evolution visibly converge instead of stalling on generation 3 or exploding into physics
garbage by generation 10. The genetic algorithm and the physics engine are both well-understood
building blocks; making them cooperate so progress is legible on a slider is the real skill on
display.

## Features

Working today:

- **Evolution engine** — tournament selection, crossover, and mutation over a chassis+wheel
  genome, run against Matter.js physics with a fitness function tuned so progress is visible and
  steady rather than solved by generation 4.
- **Generation scrubber** — the page evolves all 40 generations on load, opening the slider up as
  each lands. Scrub to any generation to replay its best car; tap any car on the floor to watch
  that one instead.
- **Shareable replay links** — any car exports to a URL carrying its full genome. No server, no
  database row. A corrupted link shows an inline error rather than a blank page.
- **Live HUD** — generation, best distance, finishers, best-ever, and a fitness curve that
  updates as the run evolves.
- **Playback controls** — play/pause, 0.5×–4× speed. Speed changes only how fast a decided run is
  shown, never the physics.
- **Synthesized sound** — every effect is built from oscillators at runtime (zero audio files),
  with a mute toggle that persists.

Still to come:

- **Track editor** — draw custom terrain and point evolution at hills and gaps you choose.
- **Track persistence** — save and switch between custom courses.

## Stack

- **JavaScript** (vanilla, ES modules) — no framework; this is a simulation + canvas app, not a
  component-heavy UI.
- **[Matter.js](https://brm.io/matter-js/)** for 2D rigid-body physics (chassis, wheels,
  constraints, terrain collision).
- **Canvas 2D** for rendering (population overview, single-car replay, track editor).
- Static site, zero backend — builds to a single directory, deployable to any static host.

## Status

The core loop works end to end: evolution, physics, the generation slider, replay, and sharing.
The track editor (epic 3) is not built yet.

See [`docs/VISION.md`](docs/VISION.md) for the design, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for a map of the code, and [`docs/BACKLOG.md`](docs/BACKLOG.md) for what is left.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # node --test — pure logic + physics, no browser needed
npm run lint
npm run build    # -> dist/, static and relative-pathed for subpath hosting
npm run preview  # serve the built dist/
```

Runs are seeded, so the demo is reproducible: the same seed always produces the same 40
generations. `test/acceptance.test.js` runs the real demo and guards that promise, so it is
slow by design.

## License

MIT — see [LICENSE](LICENSE).
